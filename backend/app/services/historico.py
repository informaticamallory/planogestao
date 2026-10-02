from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Acao, AcaoHistorico, PlanoDeAcao, PlanoHistorico
from app.models.enums import EventoHistorico, EventoPlano


def registrar_historico(
    db: Session,
    acao: Acao,
    usuario_id: int,
    evento: EventoHistorico,
    campo: str | None = None,
    anterior: object = None,
    novo: object = None,
    quando: datetime | None = None,
    detalhe: str | None = None,
) -> AcaoHistorico:
    """Registra uma entrada de auditoria da ação na mesma transação da alteração.

    Toda mudança de status, prazo ou progresso de uma Ação deve passar por aqui.
    """

    def texto(valor: object) -> str | None:
        if valor is None:
            return None
        return str(getattr(valor, "value", valor))

    registro = AcaoHistorico(
        acao=acao,
        usuario_id=usuario_id,
        evento=evento,
        campo_alterado=campo,
        valor_anterior=texto(anterior),
        valor_novo=texto(novo),
        detalhe=detalhe,
    )
    if quando is not None:
        registro.criado_em = quando
    db.add(registro)
    return registro


def registrar_historico_plano(
    db: Session,
    plano: PlanoDeAcao,
    usuario_id: int | None,
    evento: EventoPlano,
    campo: str | None = None,
    anterior: object = None,
    novo: object = None,
    motivo: str | None = None,
) -> PlanoHistorico:
    """Auditoria do plano, na mesma transação da alteração. `usuario_id=None` = alteração do sistema."""

    def texto(valor: object) -> str | None:
        return None if valor is None else str(getattr(valor, "value", valor))

    registro = PlanoHistorico(
        plano=plano,
        usuario_id=usuario_id,
        evento=evento,
        campo_alterado=campo,
        valor_anterior=texto(anterior),
        valor_novo=texto(novo),
        motivo=motivo,
    )
    db.add(registro)
    return registro
