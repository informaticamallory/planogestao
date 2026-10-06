"""Convites de primeiro acesso (página Colaboradores) e a ativação da conta pelo link.

Regras:
- Perfil sempre "Colaborador" (o cadastrado). Quem convida não escolhe perfil nem permissões.
- Lotação e áreas autorizadas só entre as áreas que quem convida acessa; "Todas as áreas" só para quem a tem.
- E-mail já cadastrado: nada é sobrescrito; quem convida vê a situação da conta.
- Conta nasce inativa + convite_pendente: não entra no sistema antes de definir a senha.
- Token: 32 bytes aleatórios, só o SHA-256 no banco, 48 h, uso único. Reenviar invalida o link anterior;
  cancelar invalida o link sem excluir a conta (nem uma conta já ativada).
- O e-mail sai pela fila existente (envios_email). Depois do envio (ou da falha definitiva) o link é apagado
  do corpo guardado. Nada aqui registra senha ou token em log ou auditoria.
"""

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_senha, utcnow
from app.core.tempo import como_utc, fuso_local
from app.models import Area, Convite, ConviteEvento, EventoConvite, Perfil, Setor, SituacaoEnvio, Usuario
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida

PERFIL_COLABORADOR = "Colaborador"
VALIDADE = timedelta(hours=48)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def link_primeiro_acesso(token: str) -> str:
    from app.core.config import get_settings

    # Fragmento (#): o navegador não o envia ao servidor web, então o token não vai para logs de acesso.
    return f"{get_settings().WEB_URL.rstrip('/')}/primeiro-acesso#t={token}"


@dataclass
class Verificacao:
    situacao: str  # valido | expirado | utilizado | cancelado | substituido | invalido
    convite: Convite | None = None

    @property
    def mensagem(self) -> str:
        return {
            "valido": "Convite válido.",
            "expirado": "Este link expirou (vale 48 horas). Peça um novo convite a quem convidou você.",
            "utilizado": "Este link já foi usado. Entre com o seu e-mail e a senha que você definiu.",
            "cancelado": "Este convite foi cancelado. Fale com quem convidou você.",
            "substituido": "Este link foi substituído por um convite mais recente. Use o último e-mail recebido.",
            "invalido": "Link de convite inválido. Confira se copiou o endereço completo do e-mail.",
        }[self.situacao]


def verificar_token(db: Session, token: str | None) -> Verificacao:
    if not token or len(token) > 200:
        return Verificacao("invalido")
    convite = db.scalar(select(Convite).where(Convite.token_hash == hash_token(token)))
    if convite is None:
        return Verificacao("invalido")
    if convite.usado_em is not None:
        return Verificacao("utilizado", convite)
    if convite.cancelado_em is not None:
        return Verificacao("cancelado", convite)
    if convite.substituido_em is not None:
        return Verificacao("substituido", convite)
    if convite.expira_em <= utcnow():
        return Verificacao("expirado", convite)
    return Verificacao("valido", convite)


def ativar_conta(db: Session, token: str, senha: str) -> Usuario:
    """Define a senha e ativa a conta (a política de senha é validada no schema). Não faz commit."""
    v = verificar_token(db, token)
    if v.situacao != "valido":
        raise RegraInvalida(v.mensagem)
    convite = v.convite
    usuario = convite.usuario
    agora = utcnow()
    usuario.senha_hash = hash_senha(senha)
    usuario.ativo, usuario.convite_pendente = True, False
    usuario.ultimo_login_em = agora
    convite.usado_em = agora
    db.add(ConviteEvento(convite_id=convite.id, usuario_id=usuario.id, evento=EventoConvite.ATIVACAO, autor_id=None,
                         detalhe="Senha definida pelo convidado; conta ativada."))
    return usuario


class ConvitesService:
    def __init__(self, db: Session, autor: Usuario):
        self.db = db
        self.autor = autor

    # ---- escopo de quem convida ----------------------------------------------------------------

    @property
    def _permitidas(self) -> set[int] | None:
        return self.autor.areas_de_acesso  # None = todas (Administrador ou "Todas as áreas")

    def opcoes(self) -> dict:
        permitidas = self._permitidas
        areas = self.db.scalars(select(Area).where(Area.ativo).order_by(Area.nome))
        setores = list(self.db.scalars(select(Setor).where(Setor.ativo).order_by(Setor.nome)))
        return dict(
            areas=[
                dict(id=a.id, nome=a.nome, setores=[dict(id=s.id, nome=s.nome) for s in setores if s.area_id == a.id])
                for a in areas if permitidas is None or a.id in permitidas
            ],
            pode_todas_areas=permitidas is None,
            perfil=PERFIL_COLABORADOR,
        )

    def _validar_areas(self, area_id: int, setor_id: int | None, areas_ids: list[int], todas: bool) -> tuple[Area, list[Area]]:
        permitidas = self._permitidas
        area = self.db.get(Area, area_id)
        if area is None or not area.ativo:
            raise RegraInvalida("Área de lotação inválida ou inativa.")
        if permitidas is not None and area.id not in permitidas:
            raise RegraInvalida("Você só pode convidar colaboradores para áreas que você acessa.")
        if setor_id is not None:
            setor = self.db.get(Setor, setor_id)
            if setor is None or not setor.ativo or setor.area_id != area.id:
                raise RegraInvalida("A função/cargo informada não pertence à área de lotação (ou está inativa).")
        if todas and permitidas is not None:
            raise RegraInvalida("Você não pode conceder “Todas as áreas”: essa abrangência não é sua.")
        ids = sorted(set(areas_ids))
        if not todas and not ids:
            raise RegraInvalida("Selecione pelo menos uma área autorizada.")
        if permitidas is not None and set(ids) - permitidas:
            raise RegraInvalida("Você só pode autorizar áreas que você mesmo acessa.")
        areas = list(self.db.scalars(select(Area).where(Area.id.in_(ids), Area.ativo))) if ids else []
        if len(areas) != len(ids):
            raise RegraInvalida("Área autorizada inválida ou inativa.")
        return area, areas

    def _obter(self, convite_id: int) -> Convite:
        convite = self.db.get(Convite, convite_id)
        # Quem não é Administrador só enxerga os convites que criou (404 também para os dos outros).
        if convite is None or (not self.autor.eh_administrador and convite.criado_por_id != self.autor.id):
            raise NaoEncontrado("Convite não encontrado.")
        return convite

    # ---- operações -------------------------------------------------------------------------------

    def criar(self, nome: str, email: str, area_id: int, setor_id: int | None, areas_ids: list[int], todas: bool) -> Convite:
        email = email.strip().lower()
        nome = " ".join(nome.split())
        if not _EMAIL.match(email):
            raise RegraInvalida("E-mail inválido.")
        existente = self.db.scalar(select(Usuario).where(func.lower(Usuario.email) == email))
        if existente is not None:
            situacao = "convite pendente" if existente.convite_pendente else ("ativa" if existente.ativo else "inativa")
            raise Conflito(
                f"Já existe uma conta com o e-mail {email} (situação: {situacao}). Nada foi alterado. "
                + ("Se o convite é seu, use “Reenviar” na lista." if existente.convite_pendente else "Fale com o Administrador.")
            )
        perfil = self.db.scalar(select(Perfil).where(Perfil.nome == PERFIL_COLABORADOR))
        if perfil is None:
            raise RegraInvalida("O perfil “Colaborador” não está cadastrado. Fale com o Administrador.")
        area, autorizadas = self._validar_areas(area_id, setor_id, areas_ids, todas)
        usuario = Usuario(
            nome=nome, email=email, perfil_id=perfil.id, area_id=area.id, setor_id=setor_id,
            # Senha aleatória descartada: a conta não entra até o convidado definir a dele.
            senha_hash=hash_senha(secrets.token_urlsafe(32)), ativo=False, convite_pendente=True, todas_areas=todas,
        )
        usuario.areas_autorizadas = autorizadas
        self.db.add(usuario)
        self.db.flush()
        convite = self._emitir(usuario, EventoConvite.CADASTRO,
                               f"Convite criado por {self.autor.nome} (perfil {PERFIL_COLABORADOR}, lotação {area.nome}).")
        self.db.commit()
        return convite

    def reenviar(self, convite_id: int) -> Convite:
        anterior = self._obter(convite_id)
        usuario = anterior.usuario
        if not usuario.convite_pendente:
            raise RegraInvalida("A conta já foi ativada: não há convite a reenviar.")
        self._invalidar_ativos(usuario.id, substituir=True)
        novo = self._emitir(usuario, EventoConvite.REENVIO, f"Reenviado por {self.autor.nome}; o link anterior deixou de valer.")
        self.db.commit()
        return novo

    def cancelar(self, convite_id: int) -> Convite:
        convite = self._obter(convite_id)
        if convite.usado_em is not None:
            raise RegraInvalida("Este convite já foi usado: a conta está ativa e não é afetada pelo cancelamento.")
        if convite.cancelado_em is not None or convite.substituido_em is not None:
            raise RegraInvalida("Este convite já não está valendo.")
        convite.cancelado_em = utcnow()
        self._suspender_envio(convite)
        self.db.add(ConviteEvento(convite_id=convite.id, usuario_id=convite.usuario_id, evento=EventoConvite.CANCELAMENTO,
                                  autor_id=self.autor.id, detalhe=f"Cancelado por {self.autor.nome}; o link deixou de valer."))
        self.db.commit()
        return convite

    def _invalidar_ativos(self, usuario_id: int, substituir: bool) -> None:
        agora = utcnow()
        for c in self.db.scalars(select(Convite).where(
            Convite.usuario_id == usuario_id, Convite.usado_em.is_(None), Convite.cancelado_em.is_(None), Convite.substituido_em.is_(None)
        )):
            c.substituido_em = agora
            self._suspender_envio(c)

    def _suspender_envio(self, convite: Convite) -> None:
        """E-mail ainda na fila de um link que deixou de valer: não sai mais (e o link sai do corpo guardado)."""
        from app.services.email_notificacoes import apagar_link_sensivel

        envio = convite.envio
        if envio is not None and envio.situacao in (SituacaoEnvio.PENDENTE, SituacaoEnvio.ENVIANDO):
            envio.situacao, envio.proxima_tentativa_em = SituacaoEnvio.IGNORADO, None
            envio.ultimo_erro = "Convite substituído ou cancelado antes do envio."
        if envio is not None:
            apagar_link_sensivel(envio)

    def _emitir(self, usuario: Usuario, evento: EventoConvite, detalhe: str) -> Convite:
        from app.services.email_notificacoes import enfileirar_convite

        token = secrets.token_urlsafe(32)
        convite = Convite(usuario_id=usuario.id, criado_por_id=self.autor.id, token_hash=hash_token(token),
                          expira_em=utcnow().replace(microsecond=0) + VALIDADE)
        self.db.add(convite)
        self.db.flush()
        self.db.add(ConviteEvento(convite_id=convite.id, usuario_id=usuario.id, evento=evento, autor_id=self.autor.id, detalhe=detalhe))
        envio = enfileirar_convite(self.db, convite, usuario, self.autor, link_primeiro_acesso(token), _formatar(convite.expira_em))
        convite.envio_id = envio.id
        self.db.add(ConviteEvento(convite_id=convite.id, usuario_id=usuario.id, evento=EventoConvite.ENVIO, autor_id=self.autor.id,
                                  detalhe=f"E-mail para {usuario.email}: {envio.situacao}."))
        return convite

    # ---- consulta ------------------------------------------------------------------------------------

    def listar(self) -> list[dict]:
        """O convite mais recente de cada pessoa convidada (o Administrador vê todos; os demais, os seus)."""
        consulta = select(Convite).order_by(Convite.id.desc())
        if not self.autor.eh_administrador:
            consulta = consulta.where(Convite.criado_por_id == self.autor.id)
        vistos: set[int] = set()
        saida = []
        agora = utcnow()
        for c in self.db.scalars(consulta):
            if c.usuario_id in vistos:
                continue
            vistos.add(c.usuario_id)
            u = c.usuario
            if c.usado_em is not None or not u.convite_pendente:
                situacao = "ativado"
            elif c.cancelado_em is not None:
                situacao = "cancelado"
            elif c.expira_em <= agora:
                situacao = "expirado"
            else:
                situacao = "pendente"
            envio = c.envio
            envio_situacao = str(envio.situacao) if envio else None
            falha = envio is not None and (envio.situacao == SituacaoEnvio.FALHOU or
                                           (envio.situacao == SituacaoEnvio.PENDENTE and envio.ultimo_erro is not None))
            saida.append(dict(
                id=c.id, usuario_id=u.id, nome=u.nome, email=u.email,
                area=u.area.nome if u.area else None, setor=u.setor.nome if u.setor else None,
                todas_areas=u.todas_areas, areas=[a.nome for a in u.areas_autorizadas],
                situacao=situacao, envio=("falha" if falha else envio_situacao),
                erro_envio=envio.ultimo_erro if falha else None,
                enviado_em=como_utc(envio.enviado_em) if envio and envio.enviado_em else None,
                criado_em=como_utc(c.criado_em), expira_em=como_utc(c.expira_em), ativado_em=como_utc(c.usado_em) if c.usado_em else None,
                criado_por=c.criado_por.nome,
                pode_reenviar=u.convite_pendente, pode_cancelar=situacao in ("pendente", "expirado") and u.convite_pendente,
            ))
        return saida


def _formatar(momento_utc: datetime) -> str:
    return como_utc(momento_utc).astimezone(fuso_local()).strftime("%d/%m/%Y %H:%M")

