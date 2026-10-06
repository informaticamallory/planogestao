"""Visibilidade de dados por usuário. Toda consulta de planos/ações deve passar por aqui.

Regra (Administrador vê tudo; para os demais, as ÁREAS AUTORIZADAS do cadastro são sempre o limite):
- Sem `planos:ver` não vê plano nenhum.
- Com `planos:ver_todos` ("Visualizar planos das áreas autorizadas"): todos os planos das áreas autorizadas.
- Sem ela: só os planos em que participa (criador, responsável pelo plano ou por uma ação principal, ou
  participante de uma equipe ATIVA do plano), e ainda assim só se o plano for de uma área autorizada.
- A lotação (usuarios.area_id) e a participação NÃO dão acesso a área não autorizada.

A participação em equipe dá só LEITURA: "Editar planos" e "Responder solicitações de prazo" valem apenas nos
planos que o usuário vê sem contar as equipes (`via_equipe=False`; ver permissoes_plano.acesso_direto).
"""

from sqlalchemy import ColumnElement, and_, exists, false, or_, select, true
from sqlalchemy.orm import aliased

from app.models import Acao, Equipe, EquipeMembro, PlanoDeAcao, Usuario

PERMISSAO_VER = "planos:ver"
PERMISSAO_VER_TODOS = "planos:ver_todos"  # rótulo: "Visualizar planos das áreas autorizadas"

MENSAGEM_SEM_ACESSO_AREA = (
    "Este usuário não possui acesso à área do plano. Solicite ao Administrador a atualização das áreas autorizadas."
)


def acao_operacional(acao=Acao) -> ColumnElement[bool]:
    """Ação que participa das listas operacionais (Minhas Ações, calendário, dashboard, indicadores, itens,
    relatórios de ativos, lembretes): não arquivada individualmente. O plano arquivado sai pelo filtro de
    planos (`filtro_planos_visiveis` sem `incluir_arquivados`). Excluídas já saem pelo filtro global."""
    return acao.arquivado_em.is_(None)


def filtro_areas_autorizadas(usuario: Usuario, coluna_area=PlanoDeAcao.area_id) -> ColumnElement[bool]:
    """Limite por área (para qualquer consulta que envolva planos, inclusive "minhas ações")."""
    areas = usuario.areas_de_acesso
    if areas is None:
        return true()
    if not areas:
        return false()
    return coluna_area.in_(sorted(areas))


def filtro_planos_visiveis(usuario: Usuario, *, incluir_arquivados: bool = False, via_equipe: bool = True) -> ColumnElement[bool]:
    """Planos que o usuário pode ver (regra no topo do módulo). Arquivados ficam de fora, salvo pedido explícito.
    Ser responsável por um sub-item NÃO dá acesso ao plano: essa pessoa só vê o próprio sub-item
    (ver AcaoService._acessivel), e também só dentro das áreas autorizadas.
    `via_equipe=False`: sem contar a participação em equipes (para operações de escrita)."""
    permissao = _filtro_permissao(usuario, via_equipe)
    if incluir_arquivados:
        return permissao
    return and_(permissao, PlanoDeAcao.arquivado_em.is_(None))


def participa_por_equipe(usuario: Usuario) -> ColumnElement[bool]:
    """O usuário é participante de uma equipe ativa (não excluída) do plano."""
    # Alias: a consulta externa pode ser de equipes (listagem de Equipes).
    equipe = aliased(Equipe)
    return exists(
        select(EquipeMembro.usuario_id)
        .join(equipe, equipe.id == EquipeMembro.equipe_id)
        .where(
            equipe.plano_id == PlanoDeAcao.id, equipe.ativo.is_(True), equipe.excluido_em.is_(None),
            EquipeMembro.usuario_id == usuario.id,
        )
    ).correlate(PlanoDeAcao)


def _filtro_permissao(usuario: Usuario, via_equipe: bool = True) -> ColumnElement[bool]:
    if usuario.eh_administrador:
        return true()
    codigos = usuario.codigos_permissao
    if PERMISSAO_VER not in codigos:
        return false()
    areas = filtro_areas_autorizadas(usuario)
    if PERMISSAO_VER_TODOS in codigos:
        return areas

    # Alias + correlate explícito: a consulta externa pode já ter `acoes` no FROM.
    acao = aliased(Acao)
    tem_acao_do_usuario = exists(
        select(acao.id).where(
            acao.plano_id == PlanoDeAcao.id, acao.responsavel_id == usuario.id, acao.acao_pai_id.is_(None)
        )
    ).correlate(PlanoDeAcao)
    formas = [PlanoDeAcao.responsavel_id == usuario.id, PlanoDeAcao.criado_por_id == usuario.id, tem_acao_do_usuario]
    if via_equipe:
        formas.append(participa_por_equipe(usuario))
    return and_(areas, or_(*formas))
