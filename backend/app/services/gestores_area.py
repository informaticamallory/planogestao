"""Gestores por área — cópia oculta (CCO) dos e-mails de notificação.

Configuração (Administração › Configurações de e-mail): vínculos área × gestor, com o recebimento ativado ou
desativado. Só define QUEM RECEBE a cópia: nunca altera as áreas autorizadas do usuário.

Regra única do envio (usada por todos os fluxos, via email_notificacoes):
1. A área do evento é resolvida pelos ids — Plano de Ação: a área do plano; ação ou sub-item: a área do próprio
   item ou, se não houver, a do item acima, subindo até o plano (`area_do_item`). Hoje a área é obrigatória em
   toda ação e sub-item; a subida é a proteção para o caso de um item sem área.
2. No enfileiramento, a regra (área do evento, área do plano e quem já é destinatário principal) fica gravada na
   linha da fila que leva a cópia oculta. Os ENDEREÇOS são resolvidos no envio (`enderecos_para`), com o cadastro
   vigente: conta ativa (sem convite pendente), perfil Gestor com "Visualizar planos", e-mail válido, vínculo
   ativo e acesso à área do evento E à área do plano (o e-mail mostra o plano). Mudanças posteriores no e-mail,
   na conta ou nas áreas autorizadas valem.
3. Sem repetição: quem já é destinatário principal do evento fica de fora (pelo id e pelo endereço), e o
   envelope remove endereços repetidos entre Para, CCO padrão/modelo e CCO por área, sem diferenciar
   maiúsculas e espaços.
Não vale para convite de primeiro acesso nem para outros e-mails de autenticação (não passam por aqui).
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Acao, Area, GestorAreaEmail, HistoricoConfigEmail, PlanoDeAcao, Usuario
from app.services.escopo import PERMISSAO_VER

PERFIL_GESTOR = "Gestor"
ESCOPO_HISTORICO = "gestores_area"
MENSAGEM_SEM_ACESSO = (
    "Este gestor não possui permissão de acesso à área selecionada. Ajuste as áreas autorizadas no cadastro do usuário "
    "antes de criar o vínculo."
)
_EMAIL_VALIDO = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")


class VinculoInvalido(Exception):
    """422 (ou 409 quando `conflito`)."""

    def __init__(self, mensagem: str, conflito: bool = False):
        super().__init__(mensagem)
        self.conflito = conflito


class VinculoNaoEncontrado(Exception):
    pass


# ---- área do evento ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class AreaDoEvento:
    area_id: int
    plano_area_id: int


def area_do_item(acao: Acao) -> int | None:
    """Ação ou sub-item: a área do próprio item; sem ela, a do item acima, subindo a hierarquia até o plano."""
    for item in (acao, *acao.ancestrais):
        if item.area_id is not None:
            return item.area_id
    return acao.plano.area_id if acao.plano is not None else None


def area_do_evento(plano: PlanoDeAcao | None = None, acao: Acao | None = None) -> AreaDoEvento | None:
    if acao is not None:
        plano = acao.plano
        area_id = area_do_item(acao)
    else:
        area_id = plano.area_id if plano is not None else None
    if area_id is None or plano is None:
        return None
    return AreaDoEvento(area_id=area_id, plano_area_id=plano.area_id)


def regra(area: AreaDoEvento | None, principais: Iterable[int | None]) -> dict | None:
    """O que gravar na linha da fila (os endereços só são resolvidos no envio)."""
    if area is None:
        return None
    return {"area_id": area.area_id, "plano_area_id": area.plano_area_id,
            "excluir": sorted({i for i in principais if i is not None})}


# ---- quem recebe ------------------------------------------------------------------------------------------


def motivo_sem_recebimento(usuario: Usuario | None, area_id: int, plano_area_id: int | None = None) -> str | None:
    """Por que este gestor não receberia a cópia agora (None = recebe). Mesma regra na tela e no envio."""
    if usuario is None:
        return "Usuário removido."
    if not usuario.ativo or usuario.convite_pendente:
        return "Usuário inativo ou com convite pendente."
    if usuario.perfil.nome != PERFIL_GESTOR:
        return f"O perfil do usuário ({usuario.perfil.nome}) não é Gestor."
    if PERMISSAO_VER not in usuario.codigos_permissao:
        return "O perfil do usuário não tem “Visualizar planos”."
    if not _EMAIL_VALIDO.match((usuario.email or "").strip()):
        return "Usuário sem e-mail válido no cadastro."
    if not usuario.acessa_area(area_id):
        return "O gestor não tem mais acesso à área (áreas autorizadas do cadastro)."
    if plano_area_id is not None and not usuario.acessa_area(plano_area_id):
        return "O gestor não tem acesso à área do plano."
    return None


def enderecos_para(db: Session, regra_envio: dict | None) -> list[str]:
    """Endereços dos gestores com vínculo ATIVO para a área do evento, lidos AGORA do cadastro (o processo da
    fila não expira objetos entre commits: tudo é relido). Sem os destinatários principais do evento."""
    if not regra_envio:
        return []
    area_id = regra_envio.get("area_id")
    plano_area_id = regra_envio.get("plano_area_id")
    excluir = set(regra_envio.get("excluir") or [])
    if area_id is None:
        return []
    ids = list(db.scalars(
        select(GestorAreaEmail.usuario_id).where(GestorAreaEmail.area_id == area_id, GestorAreaEmail.ativo.is_(True))
        .execution_options(populate_existing=True)
    ))
    enderecos: dict[str, str] = {}
    for usuario_id in ids:
        if usuario_id in excluir:
            continue
        usuario = db.scalar(select(Usuario).where(Usuario.id == usuario_id).execution_options(populate_existing=True))
        if motivo_sem_recebimento(usuario, area_id, plano_area_id) is None:
            e = usuario.email.strip()
            enderecos.setdefault(e.casefold(), e)
    return list(enderecos.values())


def tem_vinculo_ativo(db: Session, area_id: int) -> bool:
    """Há quem receber? (só para não gerar cópias sem destino; quem recebe é resolvido no envio)."""
    return db.scalar(
        select(GestorAreaEmail.id).where(GestorAreaEmail.area_id == area_id, GestorAreaEmail.ativo.is_(True)).limit(1)
    ) is not None


def sem_repetidos(enderecos: Iterable[str], fora: Iterable[str] = ()) -> list[str]:
    """Remove repetidos e os de `fora`, sem diferenciar maiúsculas e espaços (mantém a 1ª grafia)."""
    vistos = {(e or "").strip().casefold() for e in fora if e and e.strip()}
    resultado: list[str] = []
    for bruto in enderecos:
        e = (bruto or "").strip()
        if e and e.casefold() not in vistos:
            vistos.add(e.casefold())
            resultado.append(e)
    return resultado


# ---- configuração (tela) ------------------------------------------------------------------------------------


def listar(db: Session) -> list[GestorAreaEmail]:
    vinculos = list(db.scalars(select(GestorAreaEmail)))
    return sorted(vinculos, key=lambda v: (v.area.nome.casefold(), v.usuario.nome.casefold()))


def gestores_elegiveis(db: Session) -> list[Usuario]:
    """Usuários ativos com perfil Gestor (o seletor da tela)."""
    from app.models import Perfil

    return list(db.scalars(
        select(Usuario).join(Perfil, Usuario.perfil_id == Perfil.id)
        .where(Perfil.nome == PERFIL_GESTOR, Usuario.ativo.is_(True), Usuario.convite_pendente.is_(False))
        .order_by(Usuario.nome)
    ))


def _descrever(v: GestorAreaEmail) -> str:
    return f"{v.area.nome} · {v.usuario.nome} <{v.usuario.email}> · CCO {'ativado' if v.ativo else 'desativado'}"


def _historico(db: Session, campo: str, anterior: str | None, novo: str | None, autor: Usuario) -> None:
    db.add(HistoricoConfigEmail(escopo=ESCOPO_HISTORICO, campo=campo, valor_anterior=anterior, valor_novo=novo, usuario_id=autor.id))


def _validar(db: Session, area_id: int, usuario_id: int, ativo: bool) -> tuple[Area, Usuario]:
    area = db.get(Area, area_id)
    if area is None or not area.ativo:
        raise VinculoInvalido("Área inválida ou inativa.")
    usuario = db.get(Usuario, usuario_id)
    if usuario is None or not usuario.ativo or usuario.convite_pendente:
        raise VinculoInvalido("Gestor inválido ou inativo.")
    if usuario.perfil.nome != PERFIL_GESTOR:
        raise VinculoInvalido("Selecione um usuário com perfil Gestor.")
    # Desativar sempre pode (ex.: o gestor perdeu o acesso e o Administrador só quer parar o envio).
    if ativo and not usuario.acessa_area(area.id):
        raise VinculoInvalido(MENSAGEM_SEM_ACESSO)
    return area, usuario


def _duplicado(db: Session, area_id: int, usuario_id: int, exceto: int | None = None) -> bool:
    stmt = select(GestorAreaEmail.id).where(GestorAreaEmail.area_id == area_id, GestorAreaEmail.usuario_id == usuario_id)
    if exceto is not None:
        stmt = stmt.where(GestorAreaEmail.id != exceto)
    return db.scalar(stmt) is not None


_DUPLICADO = "Este gestor já está vinculado a esta área."


def criar(db: Session, area_id: int, usuario_id: int, ativo: bool, autor: Usuario) -> GestorAreaEmail:
    _validar(db, area_id, usuario_id, ativo)
    if _duplicado(db, area_id, usuario_id):
        raise VinculoInvalido(_DUPLICADO, conflito=True)
    v = GestorAreaEmail(area_id=area_id, usuario_id=usuario_id, ativo=ativo, atualizado_por_id=autor.id)
    db.add(v)
    try:
        db.flush()
    except IntegrityError:  # corrida com outro cadastro igual: a chave única do banco decide
        db.rollback()
        raise VinculoInvalido(_DUPLICADO, conflito=True) from None
    db.refresh(v)
    _historico(db, "vinculo_criado", None, _descrever(v), autor)
    db.commit()
    db.refresh(v)
    return v


def criar_lote(db: Session, usuario_id: int, area_ids: list[int], ativo: bool, autor: Usuario) -> list[GestorAreaEmail]:
    """Um vínculo por área, para o mesmo gestor, numa operação só: TODAS as áreas são validadas antes de gravar
    (ativa, acesso do gestor e não vinculada ainda); qualquer erro recusa o lote inteiro. Os vínculos que o gestor
    já tem não mudam. A lista é a das áreas escolhidas agora (nenhuma área futura entra sozinha)."""
    ids = list(dict.fromkeys(area_ids))
    if not ids:
        raise VinculoInvalido("Selecione ao menos uma área.")
    usuario = db.get(Usuario, usuario_id)
    if usuario is None or not usuario.ativo or usuario.convite_pendente:
        raise VinculoInvalido("Gestor inválido ou inativo.")
    if usuario.perfil.nome != PERFIL_GESTOR:
        raise VinculoInvalido("Selecione um usuário com perfil Gestor.")
    areas = {a.id: a for a in db.scalars(select(Area).where(Area.id.in_(ids)))}
    invalidas = [i for i in ids if i not in areas or not areas[i].ativo]
    if invalidas:
        raise VinculoInvalido("Área inválida ou inativa na seleção. Recarregue a página e tente de novo.")
    sem_acesso = [areas[i].nome for i in ids if ativo and not usuario.acessa_area(i)]
    if sem_acesso:
        extra = "" if len(ids) == 1 else f" Áreas sem acesso: {', '.join(sem_acesso)}."
        raise VinculoInvalido(MENSAGEM_SEM_ACESSO + extra)
    existentes = set(db.scalars(
        select(GestorAreaEmail.area_id).where(GestorAreaEmail.usuario_id == usuario.id, GestorAreaEmail.area_id.in_(ids))
    ))
    if existentes:
        nomes = ", ".join(areas[i].nome for i in ids if i in existentes)
        raise VinculoInvalido(f"Este gestor já está vinculado a: {nomes}. Desmarque essas áreas (nada foi salvo).", conflito=True)
    novos = [GestorAreaEmail(area_id=i, usuario_id=usuario.id, ativo=ativo, atualizado_por_id=autor.id) for i in ids]
    db.add_all(novos)
    try:
        db.flush()
    except IntegrityError:  # corrida com outro cadastro igual: nada do lote fica
        db.rollback()
        raise VinculoInvalido(_DUPLICADO, conflito=True) from None
    for v in novos:
        db.refresh(v)
        _historico(db, "vinculo_criado", None, _descrever(v), autor)
    db.commit()
    for v in novos:
        db.refresh(v)
    return sorted(novos, key=lambda v: v.area.nome.casefold())


def atualizar(db: Session, vinculo_id: int, area_id: int, usuario_id: int, ativo: bool, autor: Usuario) -> GestorAreaEmail:
    v = db.get(GestorAreaEmail, vinculo_id)
    if v is None:
        raise VinculoNaoEncontrado
    _validar(db, area_id, usuario_id, ativo)
    if _duplicado(db, area_id, usuario_id, exceto=v.id):
        raise VinculoInvalido(_DUPLICADO, conflito=True)
    antes = _descrever(v)
    v.area_id, v.usuario_id, v.ativo, v.atualizado_por_id = area_id, usuario_id, ativo, autor.id
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise VinculoInvalido(_DUPLICADO, conflito=True) from None
    db.refresh(v, ["area", "usuario"])
    depois = _descrever(v)
    if depois != antes:
        _historico(db, "vinculo_alterado", antes, depois, autor)
    db.commit()
    db.refresh(v)
    return v


def remover(db: Session, vinculo_id: int, autor: Usuario) -> None:
    v = db.get(GestorAreaEmail, vinculo_id)
    if v is None:
        raise VinculoNaoEncontrado
    _historico(db, "vinculo_removido", _descrever(v), None, autor)
    db.delete(v)
    db.commit()
