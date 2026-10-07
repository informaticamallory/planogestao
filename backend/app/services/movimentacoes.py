"""Movimentações relevantes de um plano: base do aviso "Plano sem atualização" e das "atualizações relevantes"
do resumo semanal.

Contam (sempre feitas por uma pessoa, com registro de auditoria):
- itens criados (ações e sub-itens) e o próprio plano;
- status, progresso, prazos, responsável, observação e criação de sub-item (histórico da ação);
- solicitações de prazo e respostas; comentários (o tipo existe no histórico, sem tela por enquanto);
- alterações do plano feitas por alguém: datas estimadas, responsável, liberação do rascunho, conclusão
  confirmada e desarquivamento;
- anexos enviados.
Não contam: visualizações, recálculos automáticos do sistema (status do plano, sem autor) e os próprios avisos,
que não gravam histórico.
"""

from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.tempo import data_local
from app.models import Acao, AcaoHistorico, PlanoAnexo, PlanoDeAcao, PlanoHistorico, Usuario
from app.models.enums import EventoHistorico, EventoPlano

CAMPOS_ACAO = ("status", "progresso", "prazo", "prazo_inicio", "responsavel", "observacao", "subacao")
EVENTOS_ACAO = (
    EventoHistorico.CRIACAO, EventoHistorico.SOLICITACAO, EventoHistorico.RESPOSTA_SOLICITACAO, EventoHistorico.COMENTARIO,
)
CAMPOS_PLANO = ("data_inicio_estimado", "data_fim_estimado", "responsavel", "status", "rascunho")
EVENTOS_PLANO = (EventoPlano.CRIACAO, EventoPlano.DESARQUIVAMENTO)

_ROTULO_CAMPO_ACAO = {
    "status": "Status", "progresso": "Progresso", "prazo": "Prazo de conclusão", "prazo_inicio": "Prazo inicial",
    "responsavel": "Responsável", "observacao": "Observação",
}
_ROTULO_CAMPO_PLANO = {
    "data_inicio_estimado": "Início estimado", "data_fim_estimado": "Fim estimado", "responsavel": "Responsável",
    "status": "Status", "rascunho": "Liberação do rascunho",
}


def relevante_acao():
    return or_(AcaoHistorico.evento.in_(EVENTOS_ACAO), AcaoHistorico.campo_alterado.in_(CAMPOS_ACAO))


def relevante_plano():
    return and_(
        PlanoHistorico.usuario_id.is_not(None),
        or_(PlanoHistorico.evento.in_(EVENTOS_PLANO), PlanoHistorico.campo_alterado.in_(CAMPOS_PLANO)),
    )


def ultimas(db: Session, plano_ids: list[int]) -> dict[int, datetime]:
    """Instante (UTC) da última movimentação relevante de cada plano."""
    if not plano_ids:
        return {}
    resultado: dict[int, datetime] = {}

    def juntar(linhas) -> None:
        for plano_id, quando in linhas:
            if quando is not None and (plano_id not in resultado or quando > resultado[plano_id]):
                resultado[plano_id] = quando

    juntar(db.execute(select(PlanoDeAcao.id, PlanoDeAcao.criado_em).where(PlanoDeAcao.id.in_(plano_ids))))
    juntar(db.execute(
        select(Acao.plano_id, func.max(AcaoHistorico.criado_em))
        .join(Acao, Acao.id == AcaoHistorico.acao_id)
        .where(Acao.plano_id.in_(plano_ids), relevante_acao())
        .group_by(Acao.plano_id)
    ))
    juntar(db.execute(
        select(PlanoHistorico.plano_id, func.max(PlanoHistorico.criado_em))
        .where(PlanoHistorico.plano_id.in_(plano_ids), relevante_plano())
        .group_by(PlanoHistorico.plano_id)
    ))
    juntar(db.execute(
        select(PlanoAnexo.plano_id, func.max(PlanoAnexo.criado_em)).where(PlanoAnexo.plano_id.in_(plano_ids)).group_by(PlanoAnexo.plano_id)
    ))
    return resultado


def _rotulo_item(acao: Acao) -> str:
    return f"{'Sub-item' if acao.eh_subacao else 'Ação'} {acao.numero_exibicao}"


def descrever_ultima(db: Session, plano: PlanoDeAcao) -> tuple[datetime, str]:
    """A última movimentação relevante, por extenso (o quê, quem e quando)."""
    candidatos: list[tuple[datetime, int, str]] = [(plano.criado_em, 0, f"Plano criado em {data_local(plano.criado_em):%d/%m/%Y}")]
    linha = db.execute(
        select(AcaoHistorico, Acao, Usuario.nome)
        .join(Acao, Acao.id == AcaoHistorico.acao_id)
        .join(Usuario, Usuario.id == AcaoHistorico.usuario_id)
        .where(Acao.plano_id == plano.id, relevante_acao())
        .order_by(AcaoHistorico.criado_em.desc(), AcaoHistorico.id.desc())
        .limit(1)
    ).first()
    if linha:
        h, acao, nome = linha
        quando = f"por {nome} em {data_local(h.criado_em):%d/%m/%Y}"
        item = _rotulo_item(acao)
        if h.evento == EventoHistorico.SOLICITACAO:
            texto = f"Solicitação de prazo em {item} {quando}"
        elif h.evento == EventoHistorico.RESPOSTA_SOLICITACAO:
            texto = f"Resposta à solicitação de prazo em {item} {quando}"
        elif h.evento == EventoHistorico.COMENTARIO:
            texto = f"Comentário em {item} {quando}"
        elif h.evento == EventoHistorico.CRIACAO:
            texto = f"{item} criado(a) {quando}"
        elif h.campo_alterado == "subacao":
            texto = f"Sub-item criado em {item} {quando}"
        else:
            texto = f"{_ROTULO_CAMPO_ACAO.get(h.campo_alterado or '', 'Alteração')} de {item} atualizado {quando}"
        candidatos.append((h.criado_em, 1, texto))
    linha = db.execute(
        select(PlanoHistorico, Usuario.nome)
        .join(Usuario, Usuario.id == PlanoHistorico.usuario_id)
        .where(PlanoHistorico.plano_id == plano.id, relevante_plano())
        .order_by(PlanoHistorico.criado_em.desc(), PlanoHistorico.id.desc())
        .limit(1)
    ).first()
    if linha:
        h, nome = linha
        quando = f"por {nome} em {data_local(h.criado_em):%d/%m/%Y}"
        if h.evento == EventoPlano.CRIACAO:
            texto = f"Plano criado {quando}"
        elif h.evento == EventoPlano.DESARQUIVAMENTO:
            texto = f"Plano desarquivado {quando}"
        else:
            texto = f"{_ROTULO_CAMPO_PLANO.get(h.campo_alterado or '', 'Alteração')} do plano alterado {quando}"
        candidatos.append((h.criado_em, 2, texto))
    linha = db.execute(
        select(PlanoAnexo, Usuario.nome)
        .join(Usuario, Usuario.id == PlanoAnexo.enviado_por_id)
        .where(PlanoAnexo.plano_id == plano.id)
        .order_by(PlanoAnexo.criado_em.desc(), PlanoAnexo.id.desc())
        .limit(1)
    ).first()
    if linha:
        anexo, nome = linha
        candidatos.append((anexo.criado_em, 3, f"Anexo “{anexo.nome_arquivo}” enviado por {nome} em {data_local(anexo.criado_em):%d/%m/%Y}"))
    quando, _, texto = max(candidatos, key=lambda c: (c[0], c[1]))
    return quando, texto
