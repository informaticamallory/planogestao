"""Regras de quem pode alterar um plano. Usadas para autorizar (service) e para informar a UI (detalhe)."""

from app.models import PlanoDeAcao, Usuario


def tem_autoria_ou_edicao(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Quem tem `planos:editar` ou quem criou o plano."""
    return "planos:editar" in usuario.codigos_permissao or plano.criado_por_id == usuario.id


def pode_editar(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    # O status é calculado pelas ações: um plano concluído volta a andar se uma ação for reaberta
    # ou incluída. Só o arquivado fica somente leitura.
    return tem_autoria_ou_edicao(usuario, plano) and plano.arquivado_em is None


def pode_arquivar(usuario: Usuario) -> bool:
    return "planos:editar" in usuario.codigos_permissao
