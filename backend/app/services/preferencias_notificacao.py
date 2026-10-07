"""Preferências de notificação por tipo (Meu Perfil › Notificações): receber no sistema e/ou por e-mail.

Só os sete avisos operacionais são configuráveis. Os demais (atraso, solicitações de prazo, plano a vencer ou
concluído) continuam sempre no sistema, e convites de primeiro acesso e mensagens de segurança nunca passam
por aqui. Sem registro salvo, vale o padrão do tipo: sistema ligado em todos; e-mail ligado só no resumo
semanal, na atribuição e no prazo próximo.

"Sistema" vale no canal da central (inclui o push do mobile, que só sai de uma notificação gravada). "E-mail"
vale na fila de envios.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PreferenciaNotificacao

Canal = Literal["sistema", "email"]


@dataclass(frozen=True)
class DefTipoAviso:
    tipo: str  # tipo da notificação na central (TipoEvento)
    rotulo: str
    descricao: str
    email_padrao: bool
    evento_email: str  # modelo de e-mail (services/email_modelos.py)


TIPOS: tuple[DefTipoAviso, ...] = (
    DefTipoAviso("resumo_semanal", "Resumo semanal do plano",
                 "Uma vez por semana, para o responsável (gestor) de cada plano: concluídos, atualizações, atrasos, "
                 "vencimentos dos próximos 7 dias e progresso.", True, "resumo_semanal"),
    DefTipoAviso("acao_atribuida", "Ação atribuída",
                 "Quando uma ação ou sub-item passa a ser seu (criação ou troca de responsável).", True, "acao_atribuida"),
    DefTipoAviso("acao_vencendo", "Prazo próximo",
                 "Quando um item seu, em aberto, entra na antecedência configurada antes do prazo.", True, "prazo_proximo"),
    DefTipoAviso("prazo_alterado", "Alteração de prazo",
                 "Quando a data inicial ou final de um item seu, ou de um plano que você gerencia, muda.", False,
                 "prazo_alterado"),
    DefTipoAviso("acao_concluida", "Ação concluída",
                 "Quando um item seu, de um plano que você gerencia ou abaixo de um item seu é concluído por outra pessoa.",
                 False, "acao_concluida"),
    DefTipoAviso("dependencia_liberada", "Dependência liberada",
                 "Quando todos os pré-requisitos de um item seu são concluídos e ele pode ser iniciado.", False,
                 "dependencia_liberada"),
    DefTipoAviso("plano_sem_atualizacao", "Plano sem atualização",
                 "Quando um plano que você gerencia fica sem movimentações relevantes pelo intervalo configurado.", False,
                 "plano_sem_atualizacao"),
)
POR_TIPO: dict[str, DefTipoAviso] = {t.tipo: t for t in TIPOS}


class PreferenciaInvalida(ValueError):
    pass


def configuravel(tipo: str) -> bool:
    return tipo in POR_TIPO


def _salvas(db: Session, usuario_ids: Iterable[int], tipo: str | None = None) -> dict[tuple[int, str], PreferenciaNotificacao]:
    ids = sorted(set(usuario_ids))
    if not ids:
        return {}
    stmt = select(PreferenciaNotificacao).where(PreferenciaNotificacao.usuario_id.in_(ids))
    if tipo is not None:
        stmt = stmt.where(PreferenciaNotificacao.tipo == tipo)
    return {(p.usuario_id, p.tipo): p for p in db.scalars(stmt)}


def recebem(db: Session, tipo: str, usuario_ids: Iterable[int], canal: Canal) -> set[int]:
    """Quem, entre `usuario_ids`, recebe `tipo` por `canal`. Tipo não configurável: todos."""
    ids = set(usuario_ids)
    definicao = POR_TIPO.get(tipo)
    if definicao is None:
        return ids
    salvas = _salvas(db, ids, tipo)
    padrao = True if canal == "sistema" else definicao.email_padrao
    return {i for i in ids if (getattr(salvas[(i, tipo)], canal) if (i, tipo) in salvas else padrao)}


def recebe_email(db: Session, evento_email: str, usuario_id: int) -> bool:
    """Pelo modelo de e-mail (ex.: "acao_criada" conta como "Ação atribuída" para o responsável)."""
    tipo = next((t.tipo for t in TIPOS if t.evento_email == evento_email), None)
    return tipo is None or usuario_id in recebem(db, tipo, [usuario_id], "email")


def listar(db: Session, usuario_id: int) -> list[dict]:
    salvas = _salvas(db, [usuario_id])
    itens = []
    for t in TIPOS:
        p = salvas.get((usuario_id, t.tipo))
        itens.append(dict(
            tipo=t.tipo, rotulo=t.rotulo, descricao=t.descricao,
            sistema=p.sistema if p else True, email=p.email if p else t.email_padrao,
            padrao_sistema=True, padrao_email=t.email_padrao, personalizado=p is not None,
        ))
    return itens


def salvar(db: Session, usuario_id: int, itens: list[dict]) -> list[dict]:
    """Grava os tipos enviados (os demais ficam como estão). Igual ao padrão = remove o registro."""
    vistos: set[str] = set()
    for item in itens:
        tipo = item["tipo"]
        if tipo not in POR_TIPO:
            raise PreferenciaInvalida(f"Tipo de notificação inexistente: {tipo}.")
        if tipo in vistos:
            raise PreferenciaInvalida(f"Tipo repetido: {tipo}.")
        vistos.add(tipo)
    salvas = _salvas(db, [usuario_id])
    for item in itens:
        definicao = POR_TIPO[item["tipo"]]
        atual = salvas.get((usuario_id, definicao.tipo))
        sistema, email = bool(item["sistema"]), bool(item["email"])
        if sistema and email == definicao.email_padrao:
            if atual is not None:
                db.delete(atual)
            continue
        if atual is None:
            db.add(PreferenciaNotificacao(usuario_id=usuario_id, tipo=definicao.tipo, sistema=sistema, email=email))
        else:
            atual.sistema, atual.email = sistema, email
    db.commit()
    return listar(db, usuario_id)
