"""Configuração inicial de um banco NOVO (inclusive produção): permissões, perfis padrão e o 1º administrador.

Não cria áreas, usuários de teste nem planos (isso é do seed de desenvolvimento, bloqueado em produção).
Recusa rodar se já houver um administrador ativo: não serve para redefinir senha de ninguém.

Uso (no console do serviço da API, depois das migrações):
    python -m app.seed.configuracao_inicial --email admin@empresa.com.br --nome "Nome do Administrador"

A senha é pedida no terminal sem aparecer na tela (nunca vai na linha de comando nem é impressa).
Sem terminal interativo, ela pode vir da variável ADMIN_SENHA_INICIAL (remova-a do painel depois).
"""

import argparse
import getpass
import os
import re
import sys

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_senha
from app.models import Perfil, Usuario
from app.seed.seed_auth import criar_permissoes_e_perfis

PERFIL_ADMIN = "Administrador"
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ConfiguracaoRecusada(Exception):
    pass


def validar_senha(senha: str) -> None:
    # Mais exigente que a regra geral (8): é a conta com todos os acessos.
    if len(senha) < 12 or not re.search(r"[A-Za-z]", senha) or not re.search(r"\d", senha):
        raise ConfiguracaoRecusada("A senha do administrador deve ter pelo menos 12 caracteres, com letras e números.")
    if len(senha) > 128:
        raise ConfiguracaoRecusada("A senha pode ter no máximo 128 caracteres.")


def configurar(db: Session, email: str, nome: str, senha: str) -> Usuario:
    """Cria (ou completa) permissões e perfis e o 1º administrador, numa transação só."""
    email, nome = email.strip().lower(), " ".join(nome.split())
    if not _EMAIL.match(email):
        raise ConfiguracaoRecusada(f"E-mail inválido: {email!r}.")
    if len(nome) < 2:
        raise ConfiguracaoRecusada("Informe o nome do administrador.")
    validar_senha(senha)

    admins = db.scalar(
        select(func.count()).select_from(Usuario).join(Perfil, Usuario.perfil_id == Perfil.id)
        .where(Perfil.nome == PERFIL_ADMIN, Usuario.ativo.is_(True))
    )
    if admins:
        raise ConfiguracaoRecusada(
            "Já existe um administrador ativo: nada foi alterado. Novos usuários são criados em Administração › Usuários."
        )
    if db.scalar(select(Usuario.id).where(func.lower(Usuario.email) == email)) is not None:
        raise ConfiguracaoRecusada(f"Já existe um usuário com o e-mail {email}: nada foi alterado.")

    perfis = criar_permissoes_e_perfis(db)
    admin = Usuario(nome=nome, email=email, senha_hash=hash_senha(senha), perfil_id=perfis[PERFIL_ADMIN].id, ativo=True)
    db.add(admin)
    db.commit()
    return admin


def _ler_senha() -> str:
    senha = os.environ.get("ADMIN_SENHA_INICIAL")
    if senha:
        return senha
    if not sys.stdin.isatty():
        raise ConfiguracaoRecusada("Sem terminal para digitar a senha: rode no console interativo ou use ADMIN_SENHA_INICIAL.")
    senha = getpass.getpass("Senha do administrador (não aparece ao digitar): ")
    if getpass.getpass("Repita a senha: ") != senha:
        raise ConfiguracaoRecusada("As senhas não conferem.")
    return senha


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Permissões, perfis padrão e o primeiro administrador (banco novo).")
    parser.add_argument("--email", required=True, help="E-mail (login) do administrador.")
    parser.add_argument("--nome", required=True, help="Nome completo do administrador.")
    args = parser.parse_args(argv)
    try:
        senha = _ler_senha()
        with SessionLocal() as db:
            admin = configurar(db, args.email, args.nome, senha)
    except ConfiguracaoRecusada as exc:
        print(f"Configuração inicial NÃO realizada: {exc}", file=sys.stderr)
        return 1
    print(f"Configuração inicial concluída. Perfis padrão criados e administrador {admin.nome} <{admin.email}> cadastrado.")
    print("Próximos passos: entre no sistema com esse e-mail e cadastre Áreas, Setores, Tipos de Plano, Origens e Usuários.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
