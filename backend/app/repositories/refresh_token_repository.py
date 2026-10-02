from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: Session):
        self.db = db

    def criar(self, usuario_id: int, token_hash: str, expira_em: datetime, user_agent: str | None) -> RefreshToken:
        registro = RefreshToken(
            usuario_id=usuario_id,
            token_hash=token_hash,
            expira_em=expira_em,
            user_agent=(user_agent or "")[:255] or None,
        )
        self.db.add(registro)
        return registro

    def obter_por_hash(self, token_hash: str, *, bloquear: bool = False) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        if bloquear:
            stmt = stmt.with_for_update()
        return self.db.scalar(stmt)
