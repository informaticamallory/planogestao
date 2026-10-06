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


def pode_excluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Permissão específica + poder editar o plano (autor ou "Editar planos"). Vale também para arquivado."""
    return "planos:excluir" in usuario.codigos_permissao and tem_autoria_ou_edicao(usuario, plano)


def pode_concluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Confirmar a conclusão de um plano apto: responsável pelo plano, autor ou "Editar planos"."""
    return plano.arquivado_em is None and (plano.responsavel_id == usuario.id or tem_autoria_ou_edicao(usuario, plano))
