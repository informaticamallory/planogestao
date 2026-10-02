"""Alertas de prazo: ação vencendo/atrasada e plano vencendo.

Usado de duas formas, com a mesma regra:
- pelo job agendado (todas as ações/planos ativos), e
- na hora, sempre que uma ação muda de status/prazo (`verificar_acao`).
A chave de deduplicação inclui o prazo: o mesmo alerta não se repete, mas volta a valer se o prazo mudar.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Acao, PlanoDeAcao
from app.models.enums import STATUS_ACAO_ABERTOS, STATUS_PLANO_EM_EXECUCAO, ReferenciaNotificacao
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.configuracoes import valor_inteiro
from app.services.regras import SituacaoPrazo, dias_alerta_vencimento, situacao_prazo


def dias_alerta_plano() -> int:
    return valor_inteiro("dias_alerta_vencimento_plano")


def _quando(prazo: date, hoje: date) -> str:
    dias = (prazo - hoje).days
    if dias == 0:
        return "hoje"
    if dias == 1:
        return "amanhã"
    return f"em {dias} dias ({prazo:%d/%m})"


def _plano_ativo(plano: PlanoDeAcao) -> bool:
    # Rascunho ainda não foi liberado; arquivado/concluído não gera cobrança.
    return plano.status in STATUS_PLANO_EM_EXECUCAO and plano.arquivado_em is None and not plano.rascunho


def verificar_acao(db: Session, acao: Acao, hoje: date) -> int:
    if not _plano_ativo(acao.plano) or acao.status not in STATUS_ACAO_ABERTOS:
        return 0
    situacao = situacao_prazo(acao.status, acao.prazo, hoje)
    codigo = acao.plano.codigo
    # O aviso de vencimento usa a antecedência das Configurações (a tag "A vencer" é fixa em 3 dias).
    if situacao != SituacaoPrazo.ATRASADA and hoje <= acao.prazo <= hoje + timedelta(days=dias_alerta_vencimento()):
        evento = Evento(
            tipo=TipoEvento.ACAO_VENCENDO,
            destinatarios=(acao.responsavel_id,),
            titulo=f"Ação vence {_quando(acao.prazo, hoje)} — {codigo}",
            mensagem=f"A ação “{acao.descricao}” vence {_quando(acao.prazo, hoje)} e ainda está em aberto ({acao.progresso}% concluída).",
            referencia_tipo=ReferenciaNotificacao.ACAO,
            referencia_id=acao.id,
            chave_deduplicacao=f"{TipoEvento.ACAO_VENCENDO}:{acao.id}:{acao.prazo}",
        )
    elif situacao == SituacaoPrazo.ATRASADA:
        evento = Evento(
            tipo=TipoEvento.ACAO_ATRASADA,
            destinatarios=(acao.responsavel_id,),
            titulo=f"Ação em atraso — {codigo}",
            mensagem=f"A ação “{acao.descricao}” venceu em {acao.prazo:%d/%m/%Y} e continua em aberto.",
            referencia_tipo=ReferenciaNotificacao.ACAO,
            referencia_id=acao.id,
            chave_deduplicacao=f"{TipoEvento.ACAO_ATRASADA}:{acao.id}:{acao.prazo}",
        )
    else:
        return 0
    return publicar(db, evento)


def verificar_plano(db: Session, plano: PlanoDeAcao, hoje: date) -> int:
    if not _plano_ativo(plano) or not hoje <= plano.data_fim_estimado <= hoje + timedelta(days=dias_alerta_plano()):
        return 0
    return publicar(
        db,
        Evento(
            tipo=TipoEvento.PLANO_VENCENDO,
            destinatarios=(plano.responsavel_id, plano.criado_por_id),
            titulo=f"Plano vence {_quando(plano.data_fim_estimado, hoje)} — {plano.codigo}",
            mensagem=f"O plano “{plano.nome}” tem fim estimado {_quando(plano.data_fim_estimado, hoje)}.",
            referencia_tipo=ReferenciaNotificacao.PLANO,
            referencia_id=plano.id,
            chave_deduplicacao=f"{TipoEvento.PLANO_VENCENDO}:{plano.id}:{plano.data_fim_estimado}",
        ),
    )


@dataclass
class ResultadoVerificacao:
    acoes_verificadas: int
    planos_verificados: int
    notificacoes_criadas: int


def verificar_prazos(db: Session, hoje: date) -> ResultadoVerificacao:
    """Varredura completa (job): ações abertas que vencem em até 3 dias ou já venceram, e planos a vencer."""
    acoes = db.scalars(
        select(Acao)
        .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
        .where(
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO),
            PlanoDeAcao.arquivado_em.is_(None),
            PlanoDeAcao.rascunho.is_(False),
            Acao.status.in_(STATUS_ACAO_ABERTOS),
            Acao.prazo <= hoje + timedelta(days=dias_alerta_vencimento()),
        )
    ).all()
    planos = db.scalars(
        select(PlanoDeAcao).where(
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO),
            PlanoDeAcao.arquivado_em.is_(None),
            PlanoDeAcao.rascunho.is_(False),
            PlanoDeAcao.data_fim_estimado.between(hoje, hoje + timedelta(days=dias_alerta_plano())),
        )
    ).all()
    criadas = sum(verificar_acao(db, a, hoje) for a in acoes) + sum(verificar_plano(db, p, hoje) for p in planos)
    db.commit()
    return ResultadoVerificacao(len(acoes), len(planos), criadas)
