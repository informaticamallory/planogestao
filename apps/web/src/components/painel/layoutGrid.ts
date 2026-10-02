/**
 * Funções puras do grid de widgets: conversão entre o formato da API e o do react-grid-layout,
 * busca de posição livre e o reempilhamento automático das telas menores.
 */
import type { DadoCatalogo, WidgetLayout } from "@planogestao/shared-types";
import type { LayoutItem } from "react-grid-layout";

import type { Faixa } from "../../utils/breakpoints";

export const COLUNAS_DESKTOP = 12;

/**
 * Colunas do grid pela faixa oficial (styles/breakpoints.css) e, no desktop, também pela largura do
 * contêiner (a sidebar expandida numa janela estreita pode não deixar espaço para 12 colunas).
 * Celular: 2 colunas — cards numéricos lado a lado, gráficos/listas na largura toda.
 */
export function colunasDoGrid(faixa: Faixa, larguraContainer: number): 12 | 6 | 2 {
  if (faixa === "mobile") return 2;
  if (faixa === "tablet") return 6;
  return larguraContainer >= 900 ? 12 : 6;
}

type Ret = { x: number; y: number; w: number; h: number };
const colide = (a: Ret, b: Ret) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Primeira posição (de cima para baixo, da esquerda para a direita) onde o retângulo cabe sem sobrepor. */
export function posicaoLivre(ocupados: Ret[], w: number, h: number, colunas = COLUNAS_DESKTOP): { x: number; y: number } {
  const largura = Math.min(w, colunas);
  const fundo = ocupados.reduce((m, r) => Math.max(m, r.y + r.h), 0);
  for (let y = 0; y <= fundo; y++) {
    for (let x = 0; x + largura <= colunas; x++) {
      if (!ocupados.some((r) => colide(r, { x, y, w: largura, h }))) return { x, y };
    }
  }
  return { x: 0, y: fundo };
}

const retangulo = (w: WidgetLayout): Ret => ({ x: w.posicao.x, y: w.posicao.y, w: w.tamanho.largura_colunas, h: w.tamanho.altura_linhas });

/** Ordem de leitura do layout desktop: linha a linha, da esquerda para a direita. */
export const ordemDeLeitura = (widgets: WidgetLayout[]) =>
  [...widgets].sort((a, b) => a.posicao.y - b.posicao.y || a.posicao.x - b.posicao.x);

/**
 * Layout que o grid desenha. No desktop (12 colunas) é o salvo pelo usuário; nas telas menores é
 * gerado: mesma ordem de leitura, larguras proporcionais (6 colunas) ou tudo empilhado (1 coluna).
 */
export function layoutParaColunas(widgets: WidgetLayout[], colunas: number, catalogo: Map<string, DadoCatalogo>, editando: boolean): LayoutItem[] {
  if (colunas === COLUNAS_DESKTOP) {
    return widgets.map((w) => {
      const min = catalogo.get(w.tipo_dado)?.tamanho_minimo;
      return {
        i: w.id,
        ...retangulo(w),
        minW: min?.largura_colunas ?? 1,
        minH: min?.altura_linhas ?? 1,
        maxH: 24,
        isDraggable: editando,
        isResizable: editando,
      };
    });
  }
  const ocupados: Ret[] = [];
  return ordemDeLeitura(widgets).map((w) => {
    const min = catalogo.get(w.tipo_dado)?.tamanho_minimo;
    const grafico = (min?.largura_colunas ?? 2) >= 3;
    // 6 colunas: metade da largura, sem ficar abaixo de "meia tela" para gráficos nem de 2 colunas para cards.
    // 2 colunas (celular): cards numéricos lado a lado; gráficos, listas e tabelas na largura toda.
    const largura =
      colunas === 2 ? (grafico ? 2 : 1) : Math.min(colunas, Math.max(Math.ceil(w.tamanho.largura_colunas / 2), grafico ? 3 : 2));
    const altura = w.tamanho.altura_linhas;
    const pos = posicaoLivreEmOrdem(ocupados, largura, altura, colunas);
    const r = { ...pos, w: largura, h: altura };
    ocupados.push(r);
    return { i: w.id, ...r, static: true };
  });
}

/** Como posicaoLivre, mas nunca acima do último item colocado: preserva a ordem de leitura. */
function posicaoLivreEmOrdem(ocupados: Ret[], w: number, h: number, colunas: number) {
  const ultimo = ocupados[ocupados.length - 1];
  const inicioY = ultimo ? ultimo.y : 0;
  const fundo = ocupados.reduce((m, r) => Math.max(m, r.y + r.h), 0);
  for (let y = inicioY; y <= fundo; y++) {
    const inicioX = ultimo && y === ultimo.y ? ultimo.x + ultimo.w : 0;
    for (let x = inicioX; x + w <= colunas; x++) {
      if (!ocupados.some((r) => colide(r, { x, y, w, h }))) return { x, y };
    }
  }
  return { x: 0, y: fundo };
}

/** Aplica ao rascunho as posições/tamanhos vindos do grid (só no desktop, em edição). */
export function aplicarLayout(widgets: WidgetLayout[], layout: readonly LayoutItem[]): WidgetLayout[] {
  const porId = new Map(layout.map((l) => [l.i, l]));
  return widgets.map((w) => {
    const l = porId.get(w.id);
    if (!l) return w;
    if (l.x === w.posicao.x && l.y === w.posicao.y && l.w === w.tamanho.largura_colunas && l.h === w.tamanho.altura_linhas) return w;
    return { ...w, posicao: { x: l.x, y: l.y }, tamanho: { largura_colunas: l.w, altura_linhas: l.h } };
  });
}

export const ocupadosVisiveis = (widgets: WidgetLayout[]) => widgets.filter((w) => w.visivel).map(retangulo);

/** Id novo para uma instância (o mesmo dado pode aparecer mais de uma vez). */
export function novoId(tipoDado: string, existentes: Set<string>): string {
  const base = tipoDado.slice(0, 32);
  if (!existentes.has(base)) return base;
  for (let n = 2; ; n++) if (!existentes.has(`${base}-${n}`)) return `${base}-${n}`;
}
