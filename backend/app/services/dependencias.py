"""Pré-requisitos entre ações ("Depende da conclusão de") e numeração de ações/subações.

Regras (valem para a criação, a edição e a execução, em qualquer nível da hierarquia):
- o pré-requisito é qualquer item do mesmo plano, exceto o próprio, seus ancestrais e seus descendentes
  (esses travariam: o pai só conclui depois dos filhos); sem ciclos;
- um item só inicia (em andamento, bloqueada, conclusão) com todos os pré-requisitos concluídos —
  os dele e os de todos os ancestrais; aceitar e editar continuam liberados enquanto aguarda;
- um pré-requisito com dependentes em aberto não pode ser cancelado (remova o vínculo antes).
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Acao
from app.models.enums import STATUS_ACAO_ABERTOS, STATUS_ACAO_INICIADOS, StatusAcao
from app.schemas.acao import RefAcao

# Mudanças que contam como "iniciar" a ação.
STATUS_DE_INICIO = STATUS_ACAO_INICIADOS


def ref(acao: Acao) -> RefAcao:
    return RefAcao(id=acao.id, numero=acao.numero_exibicao, descricao=acao.descricao, status=acao.status)


def rotulo(acao: Acao) -> str:
    tipo = "Sub-item" if acao.eh_subacao else "Ação"
    return f"{tipo} {acao.numero_exibicao} — “{acao.descricao}”"


def pendentes(acao: Acao) -> list[Acao]:
    """Pré-requisitos ainda não concluídos do item e de todos os seus ancestrais (sem repetição)."""
    vistos: dict[int, Acao] = {}
    for item in (acao, *acao.ancestrais):
        for p in item.depende_de:
            if p.status != StatusAcao.CONCLUIDA:
                vistos.setdefault(p.id, p)
    return list(vistos.values())


def revisar_prerequisito(acao: Acao) -> bool:
    """Já iniciada, mas com pré-requisito em aberto (ex.: reaberto depois): sinalizar para revisão."""
    return acao.iniciada_em is not None and acao.status in STATUS_ACAO_ABERTOS and bool(pendentes(acao))


def mensagem_aguardando(acao: Acao, bloqueios: list[Acao]) -> str:
    lista = "; ".join(rotulo(p) for p in bloqueios)
    sujeito = "este sub-item (ou um item acima dele)" if acao.eh_subacao else "esta ação"
    return f"Aguardando ação anterior: {sujeito} só pode iniciar depois da conclusão de {lista}."


def dependentes_abertos(acao: Acao) -> list[Acao]:
    return [d for d in acao.dependentes if d.status in STATUS_ACAO_ABERTOS]


def forma_ciclo(acao_id: int, novos: list[Acao]) -> bool:
    """True se `acao_id` passar a depender (direta ou indiretamente) de si mesma com os novos pré-requisitos."""
    vistos: set[int] = set()
    pilha = list(novos)
    while pilha:
        atual = pilha.pop()
        if atual.id == acao_id:
            return True
        if atual.id in vistos:
            continue
        vistos.add(atual.id)
        pilha.extend(atual.depende_de)
    return False


def validar_prerequisitos(
    db: Session, plano_id: int, acao_id: int | None, ids: list[int], pai: Acao | None = None
) -> tuple[list[Acao], str | None]:
    """Carrega os pré-requisitos e devolve (itens, erro).

    `acao_id` = item que depende (None se novo); `pai` = pai do item novo (para barrar a própria linhagem).
    """
    unicos = list(dict.fromkeys(ids))
    if acao_id is not None and acao_id in unicos:
        return [], "Uma ação não pode depender dela mesma."
    if not unicos:
        return [], None
    acoes = list(db.scalars(select(Acao).where(Acao.id.in_(unicos))))
    if len(acoes) != len(unicos) or any(a.plano_id != plano_id for a in acoes):
        return [], "Os pré-requisitos precisam ser itens do mesmo plano."
    if any(a.status in (StatusAcao.CANCELADA, StatusAcao.RECUSADA) for a in acoes):
        return [], "Uma ação cancelada ou recusada não pode ser pré-requisito."

    # Linhagem do item: ancestrais (e, se já existe, descendentes) não podem ser pré-requisito.
    item = db.get(Acao, acao_id) if acao_id is not None else None
    ancestrais = {a.id for a in (item.ancestrais if item else ([pai, *pai.ancestrais] if pai else []))}
    descendentes = {d.id for d in item.descendentes()} if item else set()
    if any(a.id in ancestrais for a in acoes):
        return [], "Um item não pode depender de uma ação acima dele na hierarquia (o pai só conclui depois dos filhos)."
    if any(a.id in descendentes for a in acoes):
        return [], "Um item não pode depender dos próprios sub-itens (eles é que dependem dele)."
    if acao_id is not None and forma_ciclo(acao_id, acoes):
        return [], "Dependência circular: um dos pré-requisitos já depende (direta ou indiretamente) desta ação."
    return sorted(acoes, key=lambda a: [int(n) for n in a.numero_exibicao.split(".")]), None


def ciclo_entre_novas(dependencias: list[list[int]]) -> bool:
    """Ciclo entre ações de um mesmo envio (índices). Ordenação topológica simples."""
    n = len(dependencias)
    estado = [0] * n  # 0 = não visitado, 1 = na pilha, 2 = resolvido

    def visitar(i: int) -> bool:
        estado[i] = 1
        for j in dependencias[i]:
            if estado[j] == 1 or (estado[j] == 0 and visitar(j)):
                return True
        estado[i] = 2
        return False

    return any(estado[i] == 0 and visitar(i) for i in range(n))


def proximo_numero(db: Session, plano_id: int, acao_pai_id: int | None) -> int:
    filtro = Acao.acao_pai_id == acao_pai_id if acao_pai_id is not None else Acao.acao_pai_id.is_(None)
    atual = db.scalar(select(func.max(Acao.numero)).where(Acao.plano_id == plano_id, filtro))
    return (atual or 0) + 1


def chave_ordem(acao: Acao) -> list[int]:
    """Ordem da árvore (1, 1.1, 1.1.1, 1.2, 2…), pelos números de cada nível."""
    return [a.numero for a in (*acao.caminho, acao)]
