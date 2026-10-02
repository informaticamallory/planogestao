"""Visibilidade de dados por usuário. Toda consulta de planos/ações deve passar por aqui."""

from sqlalchemy import ColumnElement, and_, exists, or_, select, true
from sqlalchemy.orm import aliased

from app.models import Acao, PlanoDeAcao, Usuario

PERMISSAO_VER_TODOS = "planos:ver_todos"


def filtro_planos_visiveis(usuario: Usuario, *, incluir_arquivados: bool = False) -> ColumnElement[bool]:
    """Quem tem `planos:ver_todos` vê tudo. Os demais veem os planos da própria área
    e aqueles em que estão envolvidos (responsável, criador ou responsável por alguma ação principal).
    Ser responsável por uma subação NÃO dá acesso ao plano: essa pessoa só vê a própria subação
    (ver AcaoService._obter). Planos arquivados ficam de fora, salvo pedido explícito."""
    permissao = _filtro_permissao(usuario)
    if incluir_arquivados:
        return permissao
    return and_(permissao, PlanoDeAcao.arquivado_em.is_(None))


def _filtro_permissao(usuario: Usuario) -> ColumnElement[bool]:
    if PERMISSAO_VER_TODOS in usuario.codigos_permissao:
        return true()

    # Alias + correlate explícito: a consulta externa pode já ter `acoes` no FROM.
    acao = aliased(Acao)
    tem_acao_do_usuario = exists(
        select(acao.id).where(
            acao.plano_id == PlanoDeAcao.id, acao.responsavel_id == usuario.id, acao.acao_pai_id.is_(None)
        )
    ).correlate(PlanoDeAcao)

    condicoes: list[ColumnElement[bool]] = [
        PlanoDeAcao.responsavel_id == usuario.id,
        PlanoDeAcao.criado_por_id == usuario.id,
        tem_acao_do_usuario,
    ]
    if usuario.area_id is not None:
        condicoes.append(PlanoDeAcao.area_id == usuario.area_id)
    return or_(*condicoes)
