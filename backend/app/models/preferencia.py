from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK


class PreferenciaLayout(Base):
    """Painel de widgets de uma tela (Dashboard, Indicadores) montado pelo usuário.

    Sem registro = o usuário nunca personalizou e recebe o layout padrão do catálogo.
    """

    __tablename__ = "preferencias_layout"

    usuario_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    tela: Mapped[str] = mapped_column(String(30), primary_key=True)  # dashboard | indicadores
    # {"versao": 2, "widgets": [{"id", "tipo_dado", "tipo_visualizacao", "posicao": {x, y},
    #   "tamanho": {largura_colunas, altura_linhas}, "visivel"}, ...]} — ver preferencias_service.
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
