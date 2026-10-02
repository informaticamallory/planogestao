"""Seed de desenvolvimento: perfis, permissões, áreas/setores e usuários.

Idempotente: pode ser executado várias vezes.
    python -m app.seed.seed_auth
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.permissoes import PERMISSOES
from app.core.security import hash_senha
from app.models import Area, Perfil, Permissao, Setor, Usuario

SENHA_PADRAO_DEV = "Senha@123"

_BASE = {"dashboard:ver", "planos:ver", "calendario:ver", "notificacoes:ver", "indicadores:ver"}
_TODAS = {p.codigo for p in PERMISSOES}

# Matriz proposta (pendente de validação com o negócio).
PERFIS: dict[str, tuple[str, set[str]]] = {
    "Administrador": ("Acesso total, incluindo administração", _TODAS),
    "Gestor": (
        "Cria e gerencia planos de ação",
        _BASE | {"planos:criar", "planos:editar", "acoes:ver_proprias", "acoes:aprovar_prazo",
                 "equipes:ver", "equipes:gerenciar", "relatorios:ver", "gamificacao:ver"},
    ),
    "Supervisor": (
        "Acompanha a área e aprova solicitações de prazo",
        _BASE | {"acoes:ver_proprias", "acoes:aprovar_prazo", "equipes:ver", "relatorios:ver", "gamificacao:ver"},
    ),
    "Responsável": ("Executa as ações atribuídas", _BASE | {"acoes:ver_proprias", "gamificacao:ver"}),
    "Consulta": ("Somente leitura", _BASE | {"relatorios:ver"}),
}

AREAS: dict[str, list[str]] = {
    "Produção": ["Usinagem", "Montagem", "Pintura"],
    "Qualidade": ["Controle de Qualidade", "Metrologia"],
    "Manutenção": ["Manutenção Mecânica", "Manutenção Elétrica"],
    "Logística": ["Almoxarifado", "Expedição"],
}

# (nome, email, perfil, área, setor)
USUARIOS: list[tuple[str, str, str, str | None, str | None]] = [
    ("Administrador do Sistema", "admin@planogestao.com.br", "Administrador", None, None),
    ("João Silva", "joao.silva@planogestao.com.br", "Gestor", "Produção", "Usinagem"),
    ("Maria Santos", "maria.santos@planogestao.com.br", "Supervisor", "Qualidade", "Controle de Qualidade"),
    ("Carlos Lima", "carlos.lima@planogestao.com.br", "Responsável", "Produção", "Montagem"),
    ("Fernanda Rocha", "fernanda.rocha@planogestao.com.br", "Responsável", "Manutenção", "Manutenção Mecânica"),
    ("Paulo Mendes", "paulo.mendes@planogestao.com.br", "Consulta", "Logística", "Expedição"),
]


def _obter_ou_criar(db: Session, model, filtros: dict, **valores):
    obj = db.scalar(select(model).filter_by(**filtros))
    if obj is None:
        obj = model(**filtros, **valores)
        db.add(obj)
        db.flush()
    return obj


def executar(db: Session) -> None:
    permissoes = {
        p.codigo: _obter_ou_criar(db, Permissao, {"codigo": p.codigo}, modulo=p.modulo, acao=p.acao, descricao=p.descricao)
        for p in PERMISSOES
    }

    perfis: dict[str, Perfil] = {}
    for nome, (descricao, codigos) in PERFIS.items():
        novo = db.scalar(select(Perfil).filter_by(nome=nome)) is None
        perfil = _obter_ou_criar(db, Perfil, {"nome": nome}, descricao=descricao)
        # Perfil existente mantém a matriz ajustada pela tela de Perfis (exceto o Administrador, sempre completo).
        if novo or nome == "Administrador":
            perfil.permissoes = [permissoes[c] for c in sorted(codigos)]
        perfis[nome] = perfil

    setores: dict[tuple[str, str], Setor] = {}
    areas: dict[str, Area] = {}
    for nome_area, nomes_setores in AREAS.items():
        area = _obter_ou_criar(db, Area, {"nome": nome_area})
        areas[nome_area] = area
        for nome_setor in nomes_setores:
            setores[(nome_area, nome_setor)] = _obter_ou_criar(db, Setor, {"area_id": area.id, "nome": nome_setor})

    senha_hash = hash_senha(SENHA_PADRAO_DEV)
    for nome, email, perfil, area, setor in USUARIOS:
        _obter_ou_criar(
            db,
            Usuario,
            {"email": email},
            nome=nome,
            senha_hash=senha_hash,
            perfil_id=perfis[perfil].id,
            area_id=areas[area].id if area else None,
            setor_id=setores[(area, setor)].id if area and setor else None,
        )

    db.commit()


def main() -> None:
    if get_settings().ENVIRONMENT == "production":
        raise SystemExit("Seed de desenvolvimento não pode rodar em produção.")
    with SessionLocal() as db:
        executar(db)
    print(f"Seed concluído. Senha de todos os usuários de desenvolvimento: {SENHA_PADRAO_DEV}")
    for _, email, perfil, *_ in USUARIOS:
        print(f"  {perfil:<14} {email}")


if __name__ == "__main__":
    main()
