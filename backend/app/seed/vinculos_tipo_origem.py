"""Vínculos padrão Tipo de Plano ↔ Origem (tabela tipo_origem), sobre os cadastros que JÁ existem.

Não cria, não renomeia nem une tipos ou origens: localiza cada um pelo nome (ignorando maiúsculas,
acentos, espaços e o tipo de travessão) e grava o vínculo pelos IDs. Só acrescenta: vínculos já
existentes, inclusive os que estão fora do mapeamento, são mantidos e aparecem no relatório.
Idempotente: rodar de novo não duplica nada (o par tipo+origem é a chave primária e é conferido antes).

Aplicado automaticamente pela migração 0021. Para conferir (ou reaplicar) depois, no console da API:
    python -m app.seed.vinculos_tipo_origem            # só mostra o que faria
    python -m app.seed.vinculos_tipo_origem --aplicar  # grava
"""

import argparse
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field

import sqlalchemy as sa
from sqlalchemy.engine import Connection

CORRETIVA, PREVENTIVA, MELHORIA = "Corretiva", "Preventiva", "Melhoria"

MAPEAMENTO: dict[str, tuple[str, ...]] = {
    "Não conformidade de produto": (CORRETIVA,),
    "Não conformidade de processo": (CORRETIVA,),
    "Reclamação de cliente": (CORRETIVA,),
    "Devolução de produto / Garantia": (CORRETIVA,),
    "Inspeção de qualidade": (CORRETIVA, PREVENTIVA),
    "Auditoria interna": (CORRETIVA, MELHORIA),
    "Auditoria externa / Cliente": (CORRETIVA, MELHORIA),
    "Problema com fornecedor": (CORRETIVA, PREVENTIVA),
    "Desvio de indicador / Meta": (CORRETIVA, MELHORIA),
    "Refugo": (CORRETIVA, MELHORIA),
    "Falha / Quebra de equipamento": (CORRETIVA,),
    "Manutenção / Inspeção de equipamento": (PREVENTIVA, MELHORIA),
    "Análise de riscos": (PREVENTIVA,),
    "Segurança — Acidente / Incidente": (CORRETIVA,),
    "Segurança — Condição insegura": (PREVENTIVA,),
    "Meio ambiente": (CORRETIVA, PREVENTIVA, MELHORIA),
    "Requisito legal / Normativo": (CORRETIVA, PREVENTIVA),
    "Gestão de mudanças": (PREVENTIVA,),
    "Auditoria 5S": (CORRETIVA, MELHORIA),
    "Sugestão de colaborador": (MELHORIA,),
    "Kaizen / Melhoria contínua": (MELHORIA,),
    "Análise de produtividade": (MELHORIA,),
    "Redução de custos": (MELHORIA,),
    "Reunião de gestão / Análise crítica": (CORRETIVA, PREVENTIVA, MELHORIA),
    "Pesquisa de satisfação": (CORRETIVA, MELHORIA),
}

# Só o necessário para ler e gravar (sem o ORM): a migração usa o esquema da época dela.
_tipos = sa.table("tipos_plano", sa.column("id"), sa.column("nome"), sa.column("ativo"))
_origens = sa.table("origens_plano", sa.column("id"), sa.column("nome"), sa.column("ativo"))
_vinculos = sa.table("tipo_origem", sa.column("tipo_plano_id"), sa.column("origem_id"))

_TRACOS = re.compile(r"\s*[-‐‑‒–—―]\s*")
_BARRA = re.compile(r"\s*/\s*")


def normalizar(nome: str) -> str:
    """Chave de comparação: sem acentos, minúsculas, espaços únicos, travessões e barras uniformes."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFKD", nome) if not unicodedata.combining(c))
    chave = " ".join(sem_acento.casefold().split())
    return _BARRA.sub("/", _TRACOS.sub(" - ", chave))


@dataclass
class Relatorio:
    adicionados: list[tuple[str, str]] = field(default_factory=list)
    ja_existiam: list[tuple[str, str]] = field(default_factory=list)
    # Vínculos que já existiam e não estão no mapeamento: mantidos.
    adicionais: list[tuple[str, str]] = field(default_factory=list)
    nao_encontrados: list[str] = field(default_factory=list)
    ambiguos: list[str] = field(default_factory=list)
    inativos: list[str] = field(default_factory=list)
    # Origens cadastradas que o mapeamento não cita (continuam como estão).
    fora_do_mapeamento: list[str] = field(default_factory=list)

    @property
    def pendencias(self) -> bool:
        return bool(self.nao_encontrados or self.ambiguos)

    def linhas(self) -> list[str]:
        saida = [
            f"Vínculos tipo ↔ origem: {len(self.adicionados)} adicionado(s), {len(self.ja_existiam)} já existia(m), "
            f"{len(self.adicionais)} adicional(is) mantido(s) fora do mapeamento."
        ]
        blocos = [
            ("Adicionado", [f"{t} ↔ {o}" for t, o in self.adicionados]),
            ("PENDÊNCIA — não encontrado (nada foi criado)", self.nao_encontrados),
            ("PENDÊNCIA — nome ambíguo (nada foi unido nem vinculado)", self.ambiguos),
            ("Vínculo existente fora do mapeamento (mantido)", [f"{t} ↔ {o}" for t, o in self.adicionais]),
            ("Cadastro inativo (vinculado, mas não aparece no formulário enquanto inativo)", self.inativos),
            ("Origem cadastrada fora do mapeamento (sem alteração)", self.fora_do_mapeamento),
        ]
        for titulo, itens in blocos:
            saida += [f"  {titulo}: {item}" for item in itens]
        return saida


def _indexar(conn: Connection, tabela) -> dict[str, list[tuple[int, str, bool]]]:
    por_chave: dict[str, list[tuple[int, str, bool]]] = defaultdict(list)
    for id_, nome, ativo in conn.execute(sa.select(tabela.c.id, tabela.c.nome, tabela.c.ativo)):
        por_chave[normalizar(nome)].append((id_, nome, bool(ativo)))
    return por_chave


def _localizar(indice, nome: str, rotulo: str, rel: Relatorio) -> tuple[int, str] | None:
    achados = indice.get(normalizar(nome), [])
    if not achados:
        rel.nao_encontrados.append(f"{rotulo} “{nome}”")
        return None
    if len(achados) > 1:
        ids = ", ".join(f"#{i} “{n}”" for i, n, _ in achados)
        rel.ambiguos.append(f"{rotulo} “{nome}” corresponde a {ids}")
        return None
    id_, nome_real, ativo = achados[0]
    if not ativo:
        rel.inativos.append(f"{rotulo} “{nome_real}” (#{id_})")
    return id_, nome_real


def aplicar(conn: Connection, gravar: bool = True) -> Relatorio:
    """Acrescenta os vínculos do MAPEAMENTO que faltam. Não faz commit: quem chama decide a transação."""
    rel = Relatorio()
    tipos, origens = _indexar(conn, _tipos), _indexar(conn, _origens)
    existentes = {(t, o) for t, o in conn.execute(sa.select(_vinculos.c.tipo_plano_id, _vinculos.c.origem_id))}

    tipo_por_nome = {}
    for nome in (CORRETIVA, PREVENTIVA, MELHORIA):
        tipo_por_nome[nome] = _localizar(tipos, nome, "Tipo", rel)

    esperados: set[tuple[int, int]] = set()
    novos: list[dict] = []
    for nome_origem, nomes_tipo in MAPEAMENTO.items():
        origem = _localizar(origens, nome_origem, "Origem", rel)
        if origem is None:
            continue
        for nome_tipo in nomes_tipo:
            tipo = tipo_por_nome[nome_tipo]
            if tipo is None:
                continue
            par = (tipo[0], origem[0])
            esperados.add(par)
            if par in existentes:
                rel.ja_existiam.append((tipo[1], origem[1]))
            else:
                existentes.add(par)
                novos.append({"tipo_plano_id": par[0], "origem_id": par[1]})
                rel.adicionados.append((tipo[1], origem[1]))

    nome_tipo_id = {i: n for itens in tipos.values() for i, n, _ in itens}
    nome_origem_id = {i: n for itens in origens.values() for i, n, _ in itens}
    # `existentes` só ganhou pares do mapeamento: o que sobra fora de `esperados` já estava no banco.
    rel.adicionais = sorted((nome_tipo_id.get(t, f"#{t}"), nome_origem_id.get(o, f"#{o}")) for t, o in existentes - esperados)
    mapeadas = {normalizar(n) for n in MAPEAMENTO}
    rel.fora_do_mapeamento = sorted(n for chave, itens in origens.items() if chave not in mapeadas for _, n, _ in itens)

    if gravar and novos:
        conn.execute(sa.insert(_vinculos), novos)
    return rel


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vínculos padrão Tipo de Plano ↔ Origem (só acrescenta, sem duplicar).")
    parser.add_argument("--aplicar", action="store_true", help="Grava os vínculos que faltam (sem isso, só mostra).")
    args = parser.parse_args(argv)

    from app.core.database import engine

    with engine.connect() as conn:
        with conn.begin() as transacao:
            rel = aplicar(conn, gravar=args.aplicar)
            if not args.aplicar:
                transacao.rollback()
    for linha in rel.linhas():
        print(linha)
    if not args.aplicar and rel.adicionados:
        print("Nada foi gravado (simulação). Rode com --aplicar para gravar.")
    return 1 if rel.pendencias else 0


if __name__ == "__main__":
    sys.exit(main())
