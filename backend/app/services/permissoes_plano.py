"""Regras de quem pode ver e alterar um plano: UMA definição, usada para autorizar (services), para informar a
tela (detalhe e listagem) e para explicar um bloqueio.

Acesso (ver o plano) — escopo.filtro_planos_visiveis: perfil com "Visualizar planos" + área do plano entre as
áreas autorizadas + um vínculo (criador, responsável/gestor do plano, responsável por uma ação principal ou
participante de equipe ativa) ou "Visualizar planos das áreas autorizadas". Ser o responsável (o gestor do plano)
ou o criador já é vínculo: não exige equipe nem ação atribuída. A área autorizada continua sendo o limite, para
todos menos o Administrador — revogar a área revoga o acesso (e `motivo_bloqueio` explica por quê).

Operações (sempre sobre um plano que o usuário vê sem contar equipes — "acesso direto"):
- editar (dados, ações, anexos): criador, ou "Editar planos"; plano não arquivado;
- arquivar/desarquivar: "Editar planos";
- excluir: "Excluir planos" + (criador ou "Editar planos"); vale também para arquivado;
- concluir: responsável/gestor do plano, criador ou "Editar planos"; plano não arquivado;
- gerenciar equipes: "Gerenciar equipes" + (responsável, criador ou "Editar planos"); plano não arquivado.
O vínculo não substitui a permissão do perfil: sem "Excluir planos", ninguém exclui, nem o próprio gestor.
"""

from collections.abc import Iterable

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, object_session

from app.models import Acao, PlanoDeAcao, Usuario
from app.services.escopo import PERMISSAO_VER, filtro_planos_visiveis

PERM_EDITAR = "planos:editar"
PERM_EXCLUIR = "planos:excluir"
PERM_EQUIPES = "equipes:gerenciar"


def operacoes(usuario: Usuario, *, criador_id: int, responsavel_id: int, arquivado: bool, direto: bool) -> dict[str, bool]:
    """O que o usuário pode fazer num plano que ele vê. `direto` = vê sem contar a participação em equipe."""
    codigos = usuario.codigos_permissao
    if not direto and not usuario.eh_administrador:
        # Só pela equipe (ou sem acesso): leitura, no máximo.
        return dict(editar=False, arquivar=False, excluir=False, concluir=False, gerenciar_equipes=False)
    autoria = criador_id == usuario.id or PERM_EDITAR in codigos
    gestor = responsavel_id == usuario.id or autoria
    return dict(
        editar=autoria and not arquivado,
        arquivar=PERM_EDITAR in codigos,
        excluir=PERM_EXCLUIR in codigos and autoria,
        concluir=not arquivado and gestor,
        gerenciar_equipes=not arquivado and PERM_EQUIPES in codigos and (usuario.eh_administrador or gestor),
    )


def acesso_direto(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Vê o plano sem contar a participação em equipes. A equipe dá só leitura: permissões de perfil que
    valem "para qualquer plano visível" ("Editar planos", "Responder solicitações de prazo") exigem isto."""
    if usuario.eh_administrador:
        return True
    db = object_session(plano)
    return db is not None and bool(ids_com_acesso_direto(db, usuario, [plano.id]))


def ids_com_acesso_direto(db: Session, usuario: Usuario, plano_ids: Iterable[int]) -> set[int]:
    """Em lote (listagem): quais destes planos o usuário vê sem contar equipes. Uma consulta só."""
    ids = list(set(plano_ids))
    if not ids:
        return set()
    if usuario.eh_administrador:
        return set(ids)
    return set(db.scalars(
        select(PlanoDeAcao.id).where(
            PlanoDeAcao.id.in_(ids), filtro_planos_visiveis(usuario, incluir_arquivados=True, via_equipe=False)
        )
    ))


def operacoes_do_plano(usuario: Usuario, plano: PlanoDeAcao) -> dict[str, bool]:
    return operacoes(usuario, criador_id=plano.criado_por_id, responsavel_id=plano.responsavel_id,
                     arquivado=plano.arquivado_em is not None, direto=acesso_direto(usuario, plano))


def tem_autoria_ou_edicao(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Criador, ou "Editar planos" com acesso direto ao plano."""
    if not acesso_direto(usuario, plano):
        return False
    return plano.criado_por_id == usuario.id or PERM_EDITAR in usuario.codigos_permissao


def pode_editar(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    # O status é calculado pelas ações: um plano concluído volta a andar se uma ação for reaberta
    # ou incluída. Só o arquivado fica somente leitura.
    return operacoes_do_plano(usuario, plano)["editar"]


def pode_arquivar(usuario: Usuario, plano: PlanoDeAcao | None = None) -> bool:
    if plano is None:
        return PERM_EDITAR in usuario.codigos_permissao
    return operacoes_do_plano(usuario, plano)["arquivar"]


def pode_excluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Permissão específica + poder editar o plano (autor ou "Editar planos"). Vale também para arquivado."""
    return operacoes_do_plano(usuario, plano)["excluir"]


def pode_concluir(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Confirmar a conclusão de um plano apto: responsável pelo plano, autor ou "Editar planos"."""
    return operacoes_do_plano(usuario, plano)["concluir"]


def pode_gerenciar_equipes(usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Criar e alterar equipes do plano: "Gerenciar equipes" + gestor do plano (responsável, autor ou "Editar
    planos"), com acesso direto (nas áreas autorizadas; participar de uma equipe não conta). Plano arquivado:
    as equipes ficam só para consulta."""
    return operacoes_do_plano(usuario, plano)["gerenciar_equipes"]


# ---- explicação de um bloqueio legítimo ------------------------------------------------------------------


def papel_no_plano(db: Session, usuario: Usuario, plano: PlanoDeAcao) -> str | None:
    """O vínculo real do usuário com o plano (sem contar equipes), para explicar um bloqueio."""
    if plano.responsavel_id == usuario.id:
        return "o responsável (gestor) deste plano"
    if plano.criado_por_id == usuario.id:
        return "quem criou este plano"
    tem_acao = db.scalar(select(exists().where(Acao.plano_id == plano.id, Acao.responsavel_id == usuario.id)))
    return "responsável por uma ação deste plano" if tem_acao else None


def motivo_bloqueio(db: Session, usuario: Usuario, plano: PlanoDeAcao) -> str | None:
    """Quem tem vínculo com o plano mas não o acessa recebe o motivo (403), em vez de "não encontrado".
    Sem vínculo, devolve None: o plano continua oculto (404), sem revelar que existe."""
    if usuario.eh_administrador:
        return None
    papel = papel_no_plano(db, usuario, plano)
    if papel is None:
        return None
    if PERMISSAO_VER not in usuario.codigos_permissao:
        return (f"Você é {papel}, mas o seu perfil ({usuario.perfil.nome}) não tem a permissão “Visualizar planos”. "
                "Solicite ao Administrador o ajuste do perfil.")
    if not usuario.acessa_area(plano.area_id):
        return (f"Você é {papel}, mas a área “{plano.area.nome}” não está entre as suas áreas autorizadas, e o acesso aos "
                "planos depende delas. Solicite ao Administrador a atualização das suas áreas autorizadas.")
    return None


def plano_existente(db: Session, plano_id: int) -> PlanoDeAcao | None:
    """O plano, sem filtro de visibilidade (excluídos continuam fora, pelo filtro global)."""
    return db.scalar(select(PlanoDeAcao).where(PlanoDeAcao.id == plano_id))
