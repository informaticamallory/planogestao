import { useSyncExternalStore } from "react";

// O CSS lê as larguras de styles/breakpoints.css. Aqui o texto do arquivo é importado cru e as larguras
// extraídas dele: não existe um segundo lugar com os números.
import definicoes from "../styles/breakpoints.css?raw";

function largura(nome: string): string {
  const m = definicoes.match(new RegExp(`@custom-media\\s+--${nome}\\s+([^;]+);`));
  if (!m) throw new Error(`Breakpoint --${nome} não definido em styles/breakpoints.css`);
  return m[1]!.trim();
}

/** Media queries oficiais, para matchMedia. */
export const MEDIA = {
  mobile: largura("mobile"),
  tablet: largura("tablet"),
  desktop: largura("desktop"),
} as const;

export type Faixa = "mobile" | "tablet" | "desktop";

const listas = Object.fromEntries(Object.entries(MEDIA).map(([k, q]) => [k, window.matchMedia(q)])) as Record<Faixa, MediaQueryList>;

const faixaAtual = (): Faixa => (listas.mobile.matches ? "mobile" : listas.tablet.matches ? "tablet" : "desktop");

function assinar(aoMudar: () => void) {
  Object.values(listas).forEach((l) => l.addEventListener("change", aoMudar));
  return () => Object.values(listas).forEach((l) => l.removeEventListener("change", aoMudar));
}

/** Faixa de largura atual da janela (reage ao redimensionar). */
export function useFaixa(): Faixa {
  return useSyncExternalStore(assinar, faixaAtual);
}
