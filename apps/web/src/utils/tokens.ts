import { useAparencia } from "../store/aparenciaStore";

/**
 * Lê o valor de uma variável CSS. Necessário para o Recharts, que recebe cores como
 * atributos SVG (onde var(--x) não é resolvido).
 */
export function lerToken(nome: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

/**
 * Tema atual, para usar como dependência de quem lê tokens com `lerToken`:
 * ao trocar claro/escuro, o componente re-renderiza e relê as cores.
 */
export function useTemaAtual() {
  return useAparencia((s) => s.tema);
}