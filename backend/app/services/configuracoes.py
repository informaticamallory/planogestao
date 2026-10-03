"""Parâmetros globais do sistema (tabela `configuracoes`).

O catálogo abaixo define as chaves válidas: só existem parâmetros que o código lê.
A leitura passa por um cache em memória com validade curta, porque as regras de prazo
são consultadas em quase toda requisição. Uma alteração vale na hora no processo que a fez
e em até CACHE_SEGUNDOS nos demais processos.
"""

import threading
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

CACHE_SEGUNDOS = 30


@dataclass(frozen=True)
class DefParametro:
    chave: str
    grupo: str
    rotulo: str
    descricao: str
    padrao: int
    minimo: int
    maximo: int
    unidade: str
    # Exposto em GET /configuracoes/publicas (textos do front, ex. "vencendo nos próximos N dias").
    publico: bool = False


CATALOGO: dict[str, DefParametro] = {
    p.chave: p
    for p in [
        DefParametro(
            "dias_alerta_vencimento_acao", "Prazos e notificações", "Antecedência do alerta de vencimento de ações",
            "O responsável é notificado do vencimento de uma ação em aberto quando faltam até este número de dias. "
            "Não altera a tag \"A vencer\", que é fixa em 3 dias.",
            padrao=3, minimo=0, maximo=30, unidade="dias", publico=True,
        ),
        DefParametro(
            "dias_alerta_vencimento_plano", "Prazos e notificações", "Antecedência do alerta de vencimento de planos",
            "Gestor e criador são notificados quando o fim estimado do plano está a até este número de dias.",
            padrao=7, minimo=0, maximo=60, unidade="dias", publico=True,
        ),
        DefParametro(
            "gamificacao_minimo_podio", "Gamificação", "Mínimo de colaboradores para exibir o pódio",
            "Abaixo disso o painel mostra um aviso em vez do pódio (Top 5).",
            padrao=3, minimo=1, maximo=5, unidade="colaboradores",
        ),
    ]
}


class ParametroInvalido(ValueError):
    pass


def validar(chave: str, valor: int) -> int:
    definicao = CATALOGO.get(chave)
    if definicao is None:
        raise KeyError(chave)
    if not definicao.minimo <= valor <= definicao.maximo:
        raise ParametroInvalido(f"{definicao.rotulo}: informe um valor entre {definicao.minimo} e {definicao.maximo}.")
    return valor


# ---- cache -----------------------------------------------------------------------------------

_trava = threading.Lock()
_valores: dict[str, str] = {}
_carregado_em = 0.0


def _carregar() -> dict[str, str]:
    from app.core.database import SessionLocal
    from app.models import Configuracao

    with SessionLocal() as db:
        return {c.chave: c.valor for c in db.scalars(select(Configuracao))}


def invalidar_cache() -> None:
    global _carregado_em
    with _trava:
        _carregado_em = 0.0


def valor_inteiro(chave: str) -> int:
    global _valores, _carregado_em
    definicao = CATALOGO[chave]
    with _trava:
        if time.monotonic() - _carregado_em > CACHE_SEGUNDOS:
            try:
                _valores = _carregar()
            except Exception:  # banco indisponível: segue com o último valor conhecido (ou o padrão)
                pass
            _carregado_em = time.monotonic()
        bruto = _valores.get(chave)
    try:
        return int(bruto) if bruto is not None else definicao.padrao
    except ValueError:
        return definicao.padrao


def valores_publicos() -> dict[str, int]:
    return {c: valor_inteiro(c) for c, d in CATALOGO.items() if d.publico}


# ---- escrita ---------------------------------------------------------------------------------


def gravar(db: Session, chave: str, valor: int, usuario_id: int):
    from app.models import Configuracao

    validar(chave, valor)
    registro = db.get(Configuracao, chave)
    if registro is None:
        registro = Configuracao(chave=chave, valor=str(valor))
        db.add(registro)
    registro.valor = str(valor)
    registro.atualizado_por_id = usuario_id
    db.commit()
    invalidar_cache()
    return registro
