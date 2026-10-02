from sqlalchemy import func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session

from app.models import PlanoSequencia


def gerar_codigo_plano(db: Session, ano: int) -> str:
    """Próximo código "PA-AAAA-NNNN" do ano, de forma atômica.

    Usa INSERT ... ON DUPLICATE KEY UPDATE com LAST_INSERT_ID(expr): o MySQL grava o
    novo número e o devolve na mesma conexão, sem corrida mesmo no primeiro plano do
    ano. A linha fica bloqueada até o commit da transação que cria o plano.
    """
    stmt = (
        insert(PlanoSequencia)
        .values(ano=ano, ultimo_numero=func.last_insert_id(1))
        .on_duplicate_key_update(ultimo_numero=func.last_insert_id(PlanoSequencia.ultimo_numero + 1))
    )
    db.execute(stmt)
    numero = db.scalar(select(func.last_insert_id()))
    return f"PA-{ano}-{numero:04d}"
