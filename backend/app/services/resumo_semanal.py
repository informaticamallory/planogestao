"""Resumo semanal do plano (job em avisos_agendados.py).

- Quando: no dia e horário de Configurações (fuso America/Sao_Paulo), na primeira verificação depois do
  horário; com o servidor fora do ar, ainda sai até 24 h depois. Período: os 7 dias completos antes do dia do
  envio (ex.: envio na segunda 13/10 → de 06/10 a 12/10).
- Para quem: SOMENTE o responsável pelo plano (o gestor do plano — um campo só para os dois papéis). Nunca
  todos os participantes de equipes nem os administradores. Conta ativa, sem convite pendente e com acesso.
- Quais planos: liberados (não rascunho), não arquivados nem excluídos, em execução — ou concluídos dentro do
  período (o último resumo).
- Conteúdo por plano: ações e sub-itens concluídos no período (separados), itens com atualizações relevantes
  (cada item uma vez, sem os já listados como concluídos), pendentes em atraso, vencimentos nos próximos 7 dias e
  o progresso atual. Itens arquivados ou excluídos ficam fora de tudo.
- Evolução do progresso: só quando existe o resumo do período imediatamente anterior (ResumoSemanalPlano guarda
  o progresso no fechamento). Sem ele, não há valor inicial confiável e nada é estimado.
- Central: uma notificação por plano (identifica o plano). E-mail: um só por pessoa, com uma seção e o botão
  "Ver plano" para cada plano.
- Duplicidade: (plano, fim do período) é único; cada pessoa é gravada numa transação própria, e a central e a
  fila têm chaves por período. Reexecutar o job não gera nada novo.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from html import escape

from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.tempo import data_local, fuso_local, inicio_do_dia_utc
from app.models import Acao, AcaoHistorico, EnvioEmail, PlanoDeAcao, ResumoSemanalPlano, Usuario
from app.models.enums import STATUS_ACAO_ABERTOS, STATUS_PLANO_EM_EXECUCAO, ReferenciaNotificacao, StatusAcao, StatusPlano
from app.services import dependencias
from app.services.avisos import acessa_plano, destinatario_valido, plano_operacional
from app.services.configuracoes import valor_inteiro
from app.services.email_modelos import modelo_efetivo, renderizar
from app.services.email_notificacoes import enfileirar_aviso, registrar_validador
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.indicadores import calcular_indicadores
from app.services.movimentacoes import relevante_acao
from app.services.preferencias_notificacao import recebem

DIAS_VENCIMENTO = 7  # "vencimento nos próximos 7 dias"
MAX_ITENS_LISTA = 10  # por lista no e-mail (o restante vira "e mais N")
JANELA_RECUPERACAO = timedelta(hours=24)
EVENTO_EMAIL = "resumo_semanal"


@dataclass
class ItemResumo:
    rotulo: str  # "Ação 2" | "Sub-item 2.1"
    descricao: str
    prazo: date
    responsavel: str


@dataclass
class ResumoPlano:
    plano_id: int
    codigo: str
    nome: str
    link: str
    acoes_concluidas: list[ItemResumo] = field(default_factory=list)
    subitens_concluidos: list[ItemResumo] = field(default_factory=list)
    atualizados: list[ItemResumo] = field(default_factory=list)
    atrasados: list[ItemResumo] = field(default_factory=list)
    vencendo: list[ItemResumo] = field(default_factory=list)
    progresso: int = 0
    progresso_anterior: int | None = None


def _item(a: Acao) -> ItemResumo:
    return ItemResumo(f"{'Sub-item' if a.eh_subacao else 'Ação'} {a.numero_exibicao}", a.descricao, a.prazo, a.responsavel.nome)


def montar(db: Session, plano: PlanoDeAcao, inicio: date, fim: date, hoje: date, progresso: int | None = None) -> ResumoPlano:
    """Números do período [inicio, fim] (datas locais) e situação em `hoje` (dia do envio)."""
    # Sem arquivados (e os excluídos já saem pelo filtro global): fora dos totalizadores operacionais.
    acoes = sorted(
        db.scalars(select(Acao).where(Acao.plano_id == plano.id, Acao.arquivado_em.is_(None))),
        key=dependencias.chave_ordem,
    )
    no_periodo = lambda d: inicio <= d <= fim  # noqa: E731
    concluidas = [a for a in acoes if a.status == StatusAcao.CONCLUIDA and a.concluida_em and no_periodo(data_local(a.concluida_em))]
    ids_concluidas = {a.id for a in concluidas}
    atualizados_ids = set(
        db.scalars(
            select(AcaoHistorico.acao_id).where(
                AcaoHistorico.acao_id.in_([a.id for a in acoes] or [0]),
                AcaoHistorico.criado_em >= inicio_do_dia_utc(inicio),
                AcaoHistorico.criado_em < inicio_do_dia_utc(fim + timedelta(days=1)),
                relevante_acao(),
            ).distinct()
        )
    )
    abertos = [a for a in acoes if a.status in STATUS_ACAO_ABERTOS]
    if progresso is None:
        # O mesmo cálculo do detalhe do plano: ações principais não arquivadas, sem as descartadas.
        progresso = calcular_indicadores(
            [(a.status, a.prazo, a.progresso, a.concluida_em) for a in acoes if not a.eh_subacao], hoje
        ).progresso
    anterior = db.scalar(
        select(ResumoSemanalPlano.progresso).where(
            ResumoSemanalPlano.plano_id == plano.id, ResumoSemanalPlano.periodo_fim == inicio - timedelta(days=1)
        )
    )
    return ResumoPlano(
        plano_id=plano.id, codigo=plano.codigo, nome=plano.nome,
        link=f"{get_settings().WEB_URL.rstrip('/')}/planos/{plano.id}",
        acoes_concluidas=[_item(a) for a in concluidas if not a.eh_subacao],
        subitens_concluidos=[_item(a) for a in concluidas if a.eh_subacao],
        atualizados=[_item(a) for a in acoes if a.id in atualizados_ids and a.id not in ids_concluidas],
        atrasados=[_item(a) for a in abertos if a.prazo < hoje],
        vencendo=[_item(a) for a in abertos if hoje <= a.prazo <= hoje + timedelta(days=DIAS_VENCIMENTO)],
        progresso=progresso,
        progresso_anterior=anterior,
    )


# ---- apresentação ------------------------------------------------------------------------------------

_COR = "#ff6600"


def _progresso_texto(r: ResumoPlano, inicio: date) -> str:
    if r.progresso_anterior is None:
        return f"{r.progresso}%"
    # O valor inicial é o fechamento do resumo anterior (dia anterior ao início deste período).
    return f"{r.progresso}% (era {r.progresso_anterior}% em {inicio - timedelta(days=1):%d/%m/%Y})"


def _secoes(r: ResumoPlano) -> list[tuple[str, list[ItemResumo], str]]:
    return [
        ("Ações concluídas no período", r.acoes_concluidas, "concluida"),
        ("Sub-itens concluídos no período", r.subitens_concluidos, "concluida"),
        ("Itens com atualizações relevantes", r.atualizados, "atualizado"),
        ("Pendentes em atraso", r.atrasados, "prazo"),
        (f"Vencem nos próximos {DIAS_VENCIMENTO} dias", r.vencendo, "prazo"),
    ]


def _linha_item(i: ItemResumo, modo: str) -> str:
    extra = f"prazo {i.prazo:%d/%m/%Y}" if modo == "prazo" else i.responsavel
    return f"{i.rotulo} — {i.descricao} ({extra})"


def bloco(resumos: list[ResumoPlano], inicio: date, fim: date) -> tuple[str, str]:
    """(html, texto) com uma seção por plano. Todo dado é escapado aqui."""
    html, texto = [], []
    for r in resumos:
        partes = [
            f'<p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1f1b18">{escape(r.codigo)} — {escape(r.nome)}</p>',
            f'<p style="margin:0 0 10px;font-size:12px;color:#8a817b">Período: {inicio:%d/%m/%Y} a {fim:%d/%m/%Y} · '
            f'Progresso atual: {escape(_progresso_texto(r, inicio))}</p>',
        ]
        texto.append(f"{r.codigo} — {r.nome}\nPeríodo: {inicio:%d/%m/%Y} a {fim:%d/%m/%Y}\nProgresso atual: {_progresso_texto(r, inicio)}")
        for titulo, itens, modo in _secoes(r):
            partes.append(
                f'<p style="margin:12px 0 4px;font-size:13px;font-weight:700;color:#3d3632">{escape(titulo)} ({len(itens)})</p>'
            )
            texto.append(f"\n{titulo} ({len(itens)}):")
            if not itens:
                partes.append('<p style="margin:0;font-size:13px;color:#8a817b">Nenhum.</p>')
                texto.append("  Nenhum.")
                continue
            visiveis, resto = itens[:MAX_ITENS_LISTA], len(itens) - MAX_ITENS_LISTA
            lis = "".join(f'<li style="margin:0 0 3px">{escape(_linha_item(i, modo))}</li>' for i in visiveis)
            if resto > 0:
                lis += f'<li style="margin:0 0 3px;color:#8a817b">e mais {resto}</li>'
            partes.append(f'<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.45;color:#3d3632">{lis}</ul>')
            texto.extend(f"  - {_linha_item(i, modo)}" for i in visiveis)
            if resto > 0:
                texto.append(f"  e mais {resto}")
        partes.append(
            f'<p style="margin:16px 0 0"><a href="{escape(r.link)}" style="display:inline-block;padding:10px 18px;border-radius:10px;'
            f'background:{_COR};color:#ffffff;font-weight:700;font-size:13px;text-decoration:none">Ver plano</a></p>'
        )
        texto.append(f"\nVer plano: {r.link}\n")
        html.append(
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #ece6e1;'
            f'border-radius:12px"><tr><td style="padding:16px">{"".join(partes)}</td></tr></table>'
        )
    return "".join(html), "\n".join(texto).strip()


def _mensagem_central(r: ResumoPlano, inicio: date) -> str:
    return (
        f"{len(r.acoes_concluidas)} ação(ões) e {len(r.subitens_concluidos)} sub-item(ns) concluídos; "
        f"{len(r.atualizados)} item(ns) com atualização; {len(r.atrasados)} em atraso; "
        f"{len(r.vencendo)} vence(m) nos próximos {DIAS_VENCIMENTO} dias. Progresso: {_progresso_texto(r, inicio)}."
    )


def _valores(usuario: Usuario, resumos: list[ResumoPlano], inicio: date, fim: date) -> dict[str, str]:
    n = len(resumos)
    return {"destinatario": usuario.nome, "periodo_inicio": f"{inicio:%d/%m/%Y}", "periodo_fim": f"{fim:%d/%m/%Y}",
            "quantidade_planos": f"{n} plano{'s' if n != 1 else ''}", "link_registro": ""}


def exemplo_bloco(base_url: str) -> tuple[str, str]:
    """Prévia/teste em Configurações de e-mail: dados fictícios, nunca de um plano real."""
    r = ResumoPlano(
        plano_id=0, codigo="PA-2026-0015", nome="Excesso de refugo nas peças injetadas", link=f"{base_url}/planos/0",
        acoes_concluidas=[ItemResumo("Ação 1", "Comprar o termopar novo", date(2026, 10, 1), "Maria Exemplo")],
        subitens_concluidos=[ItemResumo("Sub-item 2.1", "Desmontar o molde", date(2026, 10, 2), "João Exemplo")],
        atualizados=[ItemResumo("Ação 2", "Calibrar o termopar do molde da injetora 3", date(2026, 10, 9), "Maria Exemplo")],
        vencendo=[ItemResumo("Ação 2", "Calibrar o termopar do molde da injetora 3", date(2026, 10, 9), "Maria Exemplo")],
        progresso=55, progresso_anterior=30,
    )
    return bloco([r], date(2026, 9, 28), date(2026, 10, 4))


# ---- agenda e geração ----------------------------------------------------------------------------------


def ocorrencia(agora_local: datetime, dia_semana: int, minutos: int) -> tuple[date, datetime]:
    """Dia e instante (com fuso) do envio mais recente que já passou (`dia_semana` ISO: 1 = segunda)."""
    hoje = agora_local.date()
    dia = hoje - timedelta(days=(hoje.isoweekday() - dia_semana) % 7)
    momento = datetime.combine(dia, time(minutos // 60, minutos % 60), fuso_local())
    if momento > agora_local:
        dia -= timedelta(days=7)
        momento = datetime.combine(dia, time(minutos // 60, minutos % 60), fuso_local())
    return dia, momento


@dataclass
class ResultadoResumo:
    periodo: tuple[date, date] | None = None
    usuarios: int = 0
    planos: int = 0
    motivo: str | None = None  # por que não gerou (fora da janela, já gerado…)


def _planos_elegiveis(db: Session, inicio: date, fim: date) -> list[PlanoDeAcao]:
    concluido_no_periodo = (
        (PlanoDeAcao.status == StatusPlano.CONCLUIDO)
        & (PlanoDeAcao.concluido_em >= inicio_do_dia_utc(inicio))
        & (PlanoDeAcao.concluido_em < inicio_do_dia_utc(fim + timedelta(days=1)))
    )
    return list(db.scalars(
        select(PlanoDeAcao)
        .where(
            PlanoDeAcao.rascunho.is_(False), PlanoDeAcao.arquivado_em.is_(None),
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO) | concluido_no_periodo,
        )
        .order_by(PlanoDeAcao.codigo)
    ))


def gerar_resumos_semanais(db: Session, agora_local: datetime | None = None) -> ResultadoResumo:
    agora_local = agora_local or datetime.now(fuso_local())
    data_envio, momento = ocorrencia(agora_local, valor_inteiro("resumo_semanal_dia"), valor_inteiro("resumo_semanal_horario"))
    if agora_local - momento > JANELA_RECUPERACAO:
        return ResultadoResumo(motivo="fora da janela do envio")
    inicio, fim = data_envio - timedelta(days=7), data_envio - timedelta(days=1)
    resultado = ResultadoResumo(periodo=(inicio, fim))
    # Agenda alterada no meio da semana: não manda um segundo resumo poucos dias depois do anterior.
    momento_utc = momento.astimezone(UTC).replace(tzinfo=None)
    recente = db.scalar(select(func.max(ResumoSemanalPlano.gerado_em)).where(ResumoSemanalPlano.periodo_fim != fim))
    if recente is not None and recente > momento_utc - timedelta(days=5):
        resultado.motivo = "já houve resumo nos últimos 5 dias"
        return resultado

    por_usuario: dict[int, list[PlanoDeAcao]] = {}
    for plano in _planos_elegiveis(db, inicio, fim):
        por_usuario.setdefault(plano.responsavel_id, []).append(plano)
    for usuario_id, planos in por_usuario.items():
        ja_gerado = db.scalar(
            select(exists().where(ResumoSemanalPlano.usuario_id == usuario_id, ResumoSemanalPlano.periodo_fim == fim))
        )
        if ja_gerado:
            continue
        usuario = db.get(Usuario, usuario_id)
        if not destinatario_valido(usuario):
            continue
        planos = [p for p in planos if acessa_plano(db, usuario, p)]
        if not planos:
            continue
        try:
            resumos = [montar(db, p, inicio, fim, data_envio) for p in planos]
            for r in resumos:
                db.add(ResumoSemanalPlano(plano_id=r.plano_id, usuario_id=usuario_id, periodo_inicio=inicio, periodo_fim=fim,
                                          progresso=r.progresso))
                publicar(db, Evento(
                    tipo=TipoEvento.RESUMO_SEMANAL, destinatarios=(usuario_id,),
                    titulo=f"Resumo semanal — {r.codigo} ({inicio:%d/%m} a {fim:%d/%m})",
                    mensagem=_mensagem_central(r, inicio),
                    referencia_tipo=ReferenciaNotificacao.PLANO, referencia_id=r.plano_id,
                    chave_deduplicacao=f"{TipoEvento.RESUMO_SEMANAL}:{r.plano_id}:{fim}",
                ))
            if usuario_id in recebem(db, TipoEvento.RESUMO_SEMANAL, [usuario_id], "email"):
                enfileirar_aviso(
                    db, EVENTO_EMAIL, "resumo", usuario_id, [usuario], _valores(usuario, resumos, inicio, fim),
                    chave_evento=f"{EVENTO_EMAIL}:usuario:{fim}",
                    contexto={"planos": [r.plano_id for r in resumos], "inicio": inicio.isoformat(), "fim": fim.isoformat(),
                              "hoje": data_envio.isoformat()},
                    blocos={"resumo": bloco(resumos, inicio, fim)},
                )
            db.commit()
        except IntegrityError:  # outro processo gerou ao mesmo tempo: fica o dele
            db.rollback()
            continue
        resultado.usuarios += 1
        resultado.planos += len(resumos)
    return resultado


# ---- revalidação antes do envio do e-mail -----------------------------------------------------------------


def revalidar(db: Session, envio: EnvioEmail) -> str | None:
    """Confere conta e acesso a cada plano. Perdeu o acesso a parte deles: o e-mail é remontado só com os que
    restaram (mesmo período, progresso do fechamento). A nenhum: não sai."""
    usuario = db.scalar(select(Usuario).where(Usuario.id == envio.usuario_id).execution_options(populate_existing=True)) \
        if envio.usuario_id else None
    if not destinatario_valido(usuario):
        return "Destinatário inativo, removido ou com convite pendente."
    ctx = envio.contexto or {}
    ids = list(ctx.get("planos", []))
    planos = [db.scalar(select(PlanoDeAcao).where(PlanoDeAcao.id == i).execution_options(populate_existing=True)) for i in ids]
    validos = [p for p in planos if plano_operacional(p) and acessa_plano(db, usuario, p)]
    if not validos:
        return "Destinatário sem acesso aos planos do resumo (ou planos arquivados/excluídos)."
    if len(validos) == len(ids):
        return None
    inicio, fim, hoje = (date.fromisoformat(ctx[k]) for k in ("inicio", "fim", "hoje"))
    fechamento = dict(db.execute(
        select(ResumoSemanalPlano.plano_id, ResumoSemanalPlano.progresso).where(
            ResumoSemanalPlano.plano_id.in_([p.id for p in validos]), ResumoSemanalPlano.periodo_fim == fim
        )
    ).all())
    resumos = [montar(db, p, inicio, fim, hoje, progresso=fechamento.get(p.id)) for p in validos]
    modelo = modelo_efetivo(db, EVENTO_EMAIL)
    msg = renderizar(modelo.assunto, modelo.corpo, _valores(usuario, resumos, inicio, fim), EVENTO_EMAIL,
                     blocos={"resumo": bloco(resumos, inicio, fim)})
    envio.assunto, envio.corpo_html, envio.corpo_texto = msg.assunto, msg.html, msg.texto
    envio.contexto = {**ctx, "planos": [p.id for p in validos], "removidos": [i for i in ids if i not in {p.id for p in validos}]}
    return None


registrar_validador(EVENTO_EMAIL, revalidar)
