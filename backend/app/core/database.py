from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def criar_engine(**kwargs) -> Engine:
    return create_engine(
        get_settings().database_url,
        # Garante InnoDB (FKs e transações) mesmo em servidores cujo padrão é MyISAM (ex.: WAMP).
        connect_args={"init_command": "SET default_storage_engine=InnoDB"},
        **kwargs,
    )


engine = criar_engine(pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
