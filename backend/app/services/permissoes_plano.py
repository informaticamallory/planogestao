"""Regras de quem pode alterar um plano. Usadas para autorizar (service) e para informar a UI (detalhe)."""

from sqlalchemy import select
from sqlalchemy.orm import object_session

from app.models import PlanoDeAcao, Usuario
from app.services.escopo import filtro_planos_visiveis


def acesso_direto(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Vê o plano sem contar a participação em equipes. A equipe dá só leitura: permissões de perfil que
    valem "para qualquer plano visível" ("Editar planos", "Responder solicitações de prazo") exigem isto."""
    if usuario.eh_administrador:
        return True
    db = object_session(plano)
    stmt = select(PlanoDeAcao.id).where(
        PlanoDeAcao.id == plano.id, filtro_planos_visiveis(usuario, incluir_arquivados=True, via_equipe=False)
    )
    return db is not None and db.scalar(stmt) is not None


def tem_autoria_ou_edicao(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Quem tem `planos:editar` (com acesso direto ao plano) ou quem criou o plano."""
    if plano.criado_por_id == usuario.id:
        return True
    return "planos:editar" in usuario.codigos_permissao and acesso_direto(usuario, plano)


def pode_editar(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    # O status é calculado pelas ações: um plano concluído volta a andar se uma ação for reaberta
    # ou incluída. Só o arquivado fica somente leitura.
    return tem_autoria_ou_edicao(usuario, plano) and plano.arquivado_em is None


def pode_arquivar(usuario: Usuario, plano: PlanoDeAcao | None = None) -> bool:
    return "planos:editar" in usuario.codigos_permissao and (plano is None or acesso_direto(usuario, plano))


def pode_excluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Permissão específica + poder editar o plano (autor ou "Editar planos"). Vale também para arquivado."""
    return "planos:excluir" in usuario.codigos_permissao and tem_autoria_ou_edicao(usuario, plano)


def pode_concluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Confirmar a conclusão de um plano apto: responsável pelo plano, autor ou "Editar planos"."""
    return plano.arquivado_em is None and (plano.responsavel_id == usuario.id or tem_autoria_ou_edicao(usuario, plano))


def pode_gerenciar_equipes(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Criar e alterar equipes do plano: "Gerenciar equipes" + gestor do plano (responsável, autor ou "Editar
    planos"), com acesso direto (nas áreas autorizadas; participar de uma equipe não conta). Plano arquivado:
    as equipes ficam só para consulta."""
    if plano.arquivado_em is not None or "equipes:gerenciar" not in usuario.codigos_permissao:
        return False
    if usuario.eh_administrador:
        return True
    gestor = plano.responsavel_id == usuario.id or tem_autoria_ou_edicao(usuario, plano)
    return gestor and acesso_direto(usuario, plano)
