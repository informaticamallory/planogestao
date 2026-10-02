"""E-mails de notificação: criação de Plano de Ação, ação e sub-item (todos os níveis).

Fluxo:
1. O service que cria o registro chama `enfileirar_criacao_plano` / `enfileirar_criacao_item` dentro da
   transação. Cada destinatário vira uma linha em `envios_email` (a fila persistente), com a mensagem
   pronta. Um rollback descarta a fila junto com o registro: nada é avisado sobre o que não foi gravado.
2. Depois do commit, uma thread de fundo envia as linhas novas (a requisição não espera o SMTP).
3. O job periódico (agendador) reenvia as pendentes e as falhas, com espera crescente, até
   EMAIL_MAX_TENTATIVAS. Uma linha "enviando" esquecida (processo derrubado) volta para a fila.

Duplicidade: `chave` única por evento + registro + destinatário (uma pessoa em dois papéis recebe um só
e-mail), e cada linha é reservada por UPDATE condicional antes do envio, então dois processos não
mandam a mesma. A notificação interna (canal do app) é independente: falha de e-mail não a afeta.
"""

import logging
import re
import smtplib
import ssl
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from typing import Protocol

from sqlalchemy import event, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.models import Acao, EnvioEmail, PlanoDeAcao, SituacaoEnvio, Usuario
from app.services.email_modelos import ModeloEfetivo, cco_do_envio, modelo_efetivo, renderizar

logger = logging.getLogger("planogestao.email")


class EventoEmail:
    PLANO_CRIADO = "plano_criado"
    ACAO_CRIADA = "acao_criada"
    SUBITEM_CRIADO = "subitem_criado"


_EMAIL_VALIDO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CHAVE_SESSAO = "envios_email_novos"
_ESPERA_MIN = (1, 5, 15, 60, 240)  # espera antes da 2ª, 3ª… tentativa (minutos)
_PRESO_APOS = timedelta(minutes=10)  # "enviando" há mais que isso = processo caiu: volta para a fila
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="email")

# Testes desligam o envio imediato (a thread usaria outra conexão) e chamam `processar_pendentes`.
despacho_imediato = True


# ---- variáveis do registro (o texto vem do modelo: services/email_modelos.py) -------------------------


def _data(d: date | None) -> str | None:
    return d.strftime("%d/%m/%Y") if d else None  # None vira "—" na renderização


def _rotulo_item(a: Acao) -> str:
    return f"{'Sub-item' if a.eh_subacao else 'Ação'} {a.numero_exibicao}"


def _link(caminho: str) -> str:
    return f"{get_settings().WEB_URL.rstrip('/')}{caminho}"


def variaveis_plano(plano: PlanoDeAcao, autor: Usuario) -> dict[str, str | None]:
    return {
        "numero_pa": plano.codigo,
        "titulo_pa": plano.nome,
        "descricao": plano.descricao,
        "responsavel": plano.responsavel.nome,
        "area": plano.area.nome,
        "setor": plano.setor.nome if plano.setor else None,
        "prazo_inicial": _data(plano.data_inicio_estimado),
        "prazo_conclusao": _data(plano.data_fim_estimado),
        # Quem criou o registro (na liberação de um rascunho, quem libera pode ser outra pessoa).
        "criado_por": (plano.criado_por or autor).nome,
        "link_registro": _link(f"/planos/{plano.id}"),
    }


def variaveis_item(acao: Acao, autor: Usuario) -> dict[str, str | None]:
    plano, pai = acao.plano, acao.acao_pai
    return {
        "numero_pa": plano.codigo,
        "titulo_pa": plano.nome,
        "numero_item": acao.numero_exibicao,
        "descricao": acao.descricao,
        "responsavel": acao.responsavel.nome,
        "area": acao.area.nome,
        "setor": acao.setor.nome if acao.setor else None,
        "prazo_inicial": _data(acao.prazo_inicio),
        "prazo_conclusao": _data(acao.prazo),
        "criado_por": (acao.criado_por or autor).nome,
        "item_pai": f"{_rotulo_item(pai)} — {pai.descricao}" if pai is not None else None,
        "link_registro": _link(f"/acoes/{acao.id}"),
    }


# ---- enfileiramento (dentro da transação do registro) ---------------------------------------------


def _situacao(usuario: Usuario, modelo: ModeloEfetivo) -> tuple[str, str | None]:
    endereco = (usuario.email or "").strip()
    if not get_settings().EMAIL_HABILITADO:
        return SituacaoEnvio.DESABILITADO, "Envio de e-mail desligado (EMAIL_HABILITADO=false)."
    if not modelo.ativo:
        return SituacaoEnvio.MODELO_INATIVO, "Envio deste tipo de notificação desativado em Configurações de e-mail."
    if not usuario.ativo:
        return SituacaoEnvio.IGNORADO, "Usuário inativo."
    if not _EMAIL_VALIDO.match(endereco):
        return SituacaoEnvio.SEM_ENDERECO, "Responsável sem e-mail válido cadastrado: e-mail não enviado."
    return SituacaoEnvio.PENDENTE, None


def _enfileirar(db: Session, evento: str, ref_tipo: str, ref_id: int, destinatarios: list[Usuario], valores: dict) -> list[EnvioEmail]:
    """Um e-mail por destinatário, com o modelo salvo e ativo do evento (ou o padrão). O CCO (padrão +
    modelo, sem repetidos e sem os destinatários principais) vai uma única vez por evento: no primeiro
    e-mail que será de fato enviado."""
    modelo = modelo_efetivo(db, evento)
    principais = [(u.email or "").strip() for u in destinatarios]
    cco = cco_do_envio(db, modelo, principais)
    envios: list[EnvioEmail] = []
    for usuario in destinatarios:
        chave = f"{evento}:{ref_tipo}:{ref_id}:{usuario.id}"
        if db.scalar(select(EnvioEmail.id).where(EnvioEmail.chave == chave)) is not None:
            continue  # já registrado (ex.: repetição da mesma operação)
        situacao, erro = _situacao(usuario, modelo)
        msg = renderizar(modelo.assunto, modelo.corpo, {**valores, "destinatario": usuario.nome})
        leva_cco = bool(cco) and situacao == SituacaoEnvio.PENDENTE
        envio = EnvioEmail(
            chave=chave, evento=evento, referencia_tipo=ref_tipo, referencia_id=ref_id, usuario_id=usuario.id,
            destinatario=(usuario.email or "").strip() or None, cco=", ".join(cco) if leva_cco else None,
            assunto=msg.assunto, corpo_html=msg.html, corpo_texto=msg.texto, situacao=situacao, ultimo_erro=erro,
            # Truncado no segundo: o DATETIME do MySQL arredonda a fração e poderia jogar o envio para o segundo seguinte.
            proxima_tentativa_em=utcnow().replace(microsecond=0) if situacao == SituacaoEnvio.PENDENTE else None,
        )
        try:
            # Savepoint: uma corrida na chave única não pode derrubar a criação do registro.
            with db.begin_nested():
                db.add(envio)
                db.flush()
        except IntegrityError:
            continue
        if leva_cco:
            cco = []  # já vai neste e-mail
        if situacao == SituacaoEnvio.PENDENTE:
            db.info.setdefault(_CHAVE_SESSAO, []).append(envio.id)
        else:
            logger.info("E-mail %s não enviado: %s", chave, erro)
        envios.append(envio)
    if cco and get_settings().EMAIL_HABILITADO and modelo.ativo:
        logger.info("CCO de %s:%s não enviado: nenhum destinatário principal com envio.", evento, ref_id)
    return envios


def enfileirar_criacao_plano(db: Session, plano: PlanoDeAcao, autor: Usuario) -> list[EnvioEmail]:
    """Novo PA: e-mail para o responsável pelo plano."""
    db.flush()
    return _enfileirar(db, EventoEmail.PLANO_CRIADO, "plano", plano.id, [plano.responsavel], variaveis_plano(plano, autor))


def enfileirar_criacao_item(db: Session, acao: Acao, autor: Usuario) -> list[EnvioEmail]:
    """Nova ação: responsável. Novo sub-item (qualquer nível): responsável e responsável pelo pai imediato,
    um único e-mail por pessoa."""
    db.flush()
    pai = acao.acao_pai
    pessoas = {u.id: u for u in (acao.responsavel, pai.responsavel if pai is not None else None) if u is not None}
    evento = EventoEmail.SUBITEM_CRIADO if pai is not None else EventoEmail.ACAO_CRIADA
    return _enfileirar(db, evento, "acao", acao.id, list(pessoas.values()), variaveis_item(acao, autor))


@event.listens_for(Session, "after_commit")
def _apos_commit(session: Session) -> None:
    ids = session.info.pop(_CHAVE_SESSAO, [])
    if ids and despacho_imediato:
        _executor.submit(_processar_em_segundo_plano, ids)


@event.listens_for(Session, "after_rollback")
def _apos_rollback(session: Session) -> None:
    session.info.pop(_CHAVE_SESSAO, None)


def _processar_em_segundo_plano(ids: list[int]) -> None:
    from app.core.database import SessionLocal

    try:
        with SessionLocal() as db:
            processar_pendentes(db, ids=ids)
    except Exception:  # o job periódico tenta de novo
        logger.exception("Falha ao processar e-mails %s", ids)


# ---- envio --------------------------------------------------------------------------------------


class Remetente(Protocol):
    def enviar(self, envio: EnvioEmail) -> None:
        """Entrega a mensagem ou levanta exceção (a linha volta para a fila)."""


def _mensagem(envio: EnvioEmail) -> EmailMessage:
    s = get_settings()
    m = EmailMessage()
    m["Subject"] = envio.assunto
    m["From"] = formataddr((s.EMAIL_REMETENTE_NOME, s.EMAIL_REMETENTE or ""))
    m["To"] = envio.destinatario or ""
    # Message-ID estável por linha: uma reentrega após falha ambígua é reconhecida como a mesma mensagem.
    dominio = (s.EMAIL_REMETENTE or "planogestao.local").split("@")[-1]
    m["Message-ID"] = make_msgid(idstring=f"envio-{envio.id}", domain=dominio)
    m.set_content(envio.corpo_texto)
    m.add_alternative(envio.corpo_html, subtype="html")
    return m


def destinatarios_envelope(envio: EnvioEmail) -> list[str]:
    """Para + CCO (sem repetir o principal)."""
    principal = envio.destinatario or ""
    cco = [e.strip() for e in (envio.cco or "").split(",") if e.strip() and e.strip().casefold() != principal.casefold()]
    return [principal, *dict.fromkeys(cco)]


class RemetenteSmtp:
    def enviar(self, envio: EnvioEmail) -> None:
        s = get_settings()
        if not s.SMTP_HOST or not s.EMAIL_REMETENTE:
            raise RuntimeError("SMTP_HOST e EMAIL_REMETENTE precisam estar configurados.")
        msg = _mensagem(envio)
        contexto = ssl.create_default_context()
        if s.SMTP_SEGURANCA == "ssl":
            cliente = smtplib.SMTP_SSL(s.SMTP_HOST, s.SMTP_PORT, timeout=s.SMTP_TIMEOUT_S, context=contexto)
        else:
            cliente = smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=s.SMTP_TIMEOUT_S)
        with cliente:
            if s.SMTP_SEGURANCA == "starttls":
                cliente.starttls(context=contexto)
            if s.SMTP_USUARIO:
                cliente.login(s.SMTP_USUARIO, s.SMTP_SENHA or "")
            # CCO só no envelope SMTP: não aparece no cabeçalho, no corpo nem para os demais destinatários.
            cliente.send_message(msg, from_addr=s.EMAIL_REMETENTE, to_addrs=destinatarios_envelope(envio))


class RemetenteArquivo:
    """Homologação/testes: grava o .eml numa pasta em vez de enviar (nada sai do servidor)."""

    def enviar(self, envio: EnvioEmail) -> None:
        pasta = Path(get_settings().EMAIL_PASTA_ARQUIVOS)
        pasta.mkdir(parents=True, exist_ok=True)
        # Nome fixo por linha: reprocessar sobrescreve, não duplica. O envelope (com o CCO) fica à parte,
        # como no SMTP: o .eml é o que o destinatário veria.
        (pasta / f"envio-{envio.id}.eml").write_bytes(bytes(_mensagem(envio)))
        (pasta / f"envio-{envio.id}.envelope.txt").write_text("\n".join(destinatarios_envelope(envio)), encoding="utf-8")


def remetente_configurado() -> Remetente:
    return RemetenteArquivo() if get_settings().EMAIL_MODO == "arquivo" else RemetenteSmtp()


@dataclass
class ResultadoProcessamento:
    enviados: int = 0
    falhas: int = 0
    esgotados: int = 0


def processar_pendentes(
    db: Session, remetente: Remetente | None = None, ids: list[int] | None = None, limite: int = 50,
    agora: Callable[[], datetime] = utcnow,
) -> ResultadoProcessamento:
    """Envia as linhas pendentes vencidas (ou só `ids`). Cada linha é reservada antes do envio."""
    r = ResultadoProcessamento()
    s = get_settings()
    if not s.EMAIL_HABILITADO:
        return r
    remetente = remetente or remetente_configurado()
    instante = agora()
    # Reservas esquecidas por um processo que caiu voltam para a fila.
    db.execute(
        update(EnvioEmail)
        .where(EnvioEmail.situacao == SituacaoEnvio.ENVIANDO, EnvioEmail.processando_desde < instante - _PRESO_APOS)
        .values(situacao=SituacaoEnvio.PENDENTE, processando_desde=None)
    )
    consulta = (
        select(EnvioEmail.id)
        .where(EnvioEmail.situacao == SituacaoEnvio.PENDENTE, EnvioEmail.proxima_tentativa_em <= instante)
        .order_by(EnvioEmail.id)
        .limit(limite)
    )
    if ids is not None:
        consulta = consulta.where(EnvioEmail.id.in_(ids))
    candidatos = list(db.scalars(consulta))
    db.commit()
    for envio_id in candidatos:
        reservado = db.execute(
            update(EnvioEmail)
            .where(EnvioEmail.id == envio_id, EnvioEmail.situacao == SituacaoEnvio.PENDENTE)
            .values(situacao=SituacaoEnvio.ENVIANDO, processando_desde=agora())
        ).rowcount
        db.commit()
        if reservado != 1:
            continue  # outro processo pegou
        envio = db.get(EnvioEmail, envio_id)
        db.refresh(envio)
        envio.tentativas += 1
        try:
            remetente.enviar(envio)
        except Exception as exc:  # qualquer falha do serviço: registra e agenda nova tentativa
            envio.ultimo_erro = f"{type(exc).__name__}: {exc}"[:2000]
            if envio.tentativas >= s.EMAIL_MAX_TENTATIVAS:
                envio.situacao = SituacaoEnvio.FALHOU
                envio.proxima_tentativa_em = None
                r.esgotados += 1
            else:
                envio.situacao = SituacaoEnvio.PENDENTE
                espera = _ESPERA_MIN[min(envio.tentativas - 1, len(_ESPERA_MIN) - 1)]
                envio.proxima_tentativa_em = agora() + timedelta(minutes=espera)
                r.falhas += 1
            logger.warning("Falha no e-mail %s (tentativa %s): %s", envio.chave, envio.tentativas, envio.ultimo_erro)
        else:
            envio.situacao = SituacaoEnvio.ENVIADO
            envio.enviado_em = agora()
            envio.ultimo_erro = None
            envio.proxima_tentativa_em = None
            r.enviados += 1
        envio.processando_desde = None
        db.commit()
    return r


# ---- e-mail de teste (tela Configurações de e-mail) -------------------------------------------------


def enviar_teste(db: Session, evento: str, destinatario: str, assunto: str, corpo: str, admin: Usuario) -> EnvioEmail:
    """Envia AGORA o modelo (o texto da tela, salvo ou não) com dados fictícios, só para `destinatario`:
    sem os destinatários reais e sem CCO. Fica no registro de envios como "teste_<evento>"."""
    from uuid import uuid4

    from app.services.email_modelos import dados_ficticios

    msg = renderizar(assunto, corpo, dados_ficticios(evento))
    envio = EnvioEmail(
        chave=f"teste:{uuid4().hex}", evento=f"teste_{evento}", referencia_tipo="teste", referencia_id=0, usuario_id=admin.id,
        destinatario=destinatario, cco=None, assunto=msg.assunto, corpo_html=msg.html, corpo_texto=msg.texto,
        situacao=SituacaoEnvio.ENVIANDO, processando_desde=utcnow(), tentativas=1,
    )
    db.add(envio)
    db.flush()
    try:
        remetente_configurado().enviar(envio)
    except Exception as exc:
        envio.situacao, envio.ultimo_erro = SituacaoEnvio.FALHOU, f"{type(exc).__name__}: {exc}"[:2000]
    else:
        envio.situacao, envio.enviado_em = SituacaoEnvio.ENVIADO, utcnow()
    envio.processando_desde = None
    db.commit()
    return envio
