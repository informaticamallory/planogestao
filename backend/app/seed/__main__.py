"""Seed completo de desenvolvimento: python -m app.seed [--reset]"""

import sys

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.seed import seed_auth, seed_planos

if get_settings().ENVIRONMENT == "production":
    raise SystemExit("Seed de desenvolvimento não pode rodar em produção.")

with SessionLocal() as db:
    seed_auth.executar(db)
    total = seed_planos.executar(db, reset="--reset" in sys.argv)

print(f"Seed concluído ({total} planos criados). Senha dos usuários: {seed_auth.SENHA_PADRAO_DEV}")
