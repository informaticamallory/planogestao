import type { CorDestaque, TamanhoFonte, TemaPreferido } from "@planogestao/shared-types";
import { create } from "zustand";

/**
 * Aparência do Mallory Design System, aplicada em <html data-theme data-accent data-density>.
 *
 * - `preferencia` (claro/escuro/automático), `cor` e `fonte` (tamanho do texto) pertencem à CONTA: vêm do usuário logado
 *   (/auth/me) e são salvas via API em Meu Perfil — acompanham o usuário entre dispositivos.
 * - O localStorage é só um cache, lido pelo script inline do index.html antes da primeira pintura
 *   (mesma chave), para a tela não piscar enquanto a sessão é restaurada.
 * - Densidade continua sendo conveniência deste navegador.
 */
export type Tema = "light" | "dark";
export type Densidade = "compact" | "comfortable" | "spacious";

export const CHAVE_APARENCIA = "planogestao:aparencia";
const PREFERENCIAS: TemaPreferido[] = ["claro", "escuro", "automatico"];
const CORES: CorDestaque[] = ["azul", "verde", "roxo", "petroleo"];
const FONTES: TamanhoFonte[] = ["pequeno", "padrao", "grande", "extra_grande"];
const DENSIDADES: Densidade[] = ["compact", "comfortable", "spacious"];

interface Aparencia {
  preferencia: TemaPreferido;
  cor: CorDestaque | null;
  /** Tamanho do texto: muda só o font-size da raiz (<html data-fonte>); o resto é rem. */
  fonte: TamanhoFonte;
  densidade: Densidade;
}

const midiaEscura = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const temaEfetivo = (p: TemaPreferido): Tema => (p === "escuro" || (p === "automatico" && midiaEscura?.matches) ? "dark" : "light");

function ler(): Aparencia {
  const padrao: Aparencia = { preferencia: "automatico", cor: null, fonte: "padrao", densidade: "comfortable" };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_APARENCIA) ?? "{}") as Partial<Aparencia> & { tema?: string };
    // Formato antigo guardava só "light"/"dark".
    const antigo = salvo.tema === "dark" ? "escuro" : salvo.tema === "light" ? "claro" : undefined;
    return {
      preferencia: PREFERENCIAS.includes(salvo.preferencia as TemaPreferido) ? (salvo.preferencia as TemaPreferido) : antigo ?? padrao.preferencia,
      cor: CORES.includes(salvo.cor as CorDestaque) ? (salvo.cor as CorDestaque) : null,
      fonte: FONTES.includes(salvo.fonte as TamanhoFonte) ? (salvo.fonte as TamanhoFonte) : padrao.fonte,
      densidade: DENSIDADES.includes(salvo.densidade as Densidade) ? (salvo.densidade as Densidade) : padrao.densidade,
    };
  } catch {
    return padrao;
  }
}

/**
 * Trocar o font-size da raiz em tempo real nem sempre recalcula todos os elementos com rem no Chromium
 * (alguns ficaram com o tamanho antigo até o próximo recálculo). Força um único recálculo de estilo,
 * sem piscar (tudo no mesmo quadro) e mantendo a posição da rolagem. Só roda quando o tamanho muda.
 */
function recalcularEstilos() {
  const corpo = document.body;
  if (!corpo) return;
  const { scrollX, scrollY } = window;
  corpo.style.display = "none";
  void corpo.offsetHeight;
  corpo.style.display = "";
  window.scrollTo(scrollX, scrollY);
}

function aplicar(a: Aparencia) {
  const html = document.documentElement;
  html.dataset.theme = temaEfetivo(a.preferencia);
  if (a.cor) html.dataset.accent = a.cor;
  else delete html.dataset.accent;
  if (html.dataset.fonte !== a.fonte) {
    html.dataset.fonte = a.fonte;
    recalcularEstilos();
  }
  html.dataset.density = a.densidade;
  try {
    localStorage.setItem(CHAVE_APARENCIA, JSON.stringify(a));
  } catch {
    // Sem armazenamento (modo privado etc.): vale só nesta aba até a sessão ser restaurada.
  }
}

interface AparenciaState extends Aparencia {
  /** Tema efetivo (automático já resolvido pelo sistema operacional). */
  tema: Tema;
  /** Aplica a aparência salva na conta (login, restauração de sessão, salvamento em Meu Perfil). */
  aplicarDaConta: (preferencia: TemaPreferido, cor: CorDestaque | null, fonte: TamanhoFonte) => void;
  setDensidade: (densidade: Densidade) => void;
}

const inicial = ler();
aplicar(inicial);

export const useAparencia = create<AparenciaState>((set, get) => ({
  ...inicial,
  tema: temaEfetivo(inicial.preferencia),
  aplicarDaConta: (preferencia, cor, fonte) => {
    const { densidade } = get();
    aplicar({ preferencia, cor, fonte, densidade });
    set({ preferencia, cor, fonte, tema: temaEfetivo(preferencia) });
  },
  setDensidade: (densidade) => {
    const { preferencia, cor, fonte } = get();
    aplicar({ preferencia, cor, fonte, densidade });
    set({ densidade });
  },
}));

if (typeof window !== "undefined") {
  // "Automático" acompanha a troca de tema do sistema operacional em tempo real.
  midiaEscura?.addEventListener("change", () => {
    const s = useAparencia.getState();
    if (s.preferencia === "automatico") s.aplicarDaConta(s.preferencia, s.cor, s.fonte);
  });
  // Impressão sempre no tema claro (papel branco), voltando ao tema escolhido depois.
  window.addEventListener("beforeprint", () => {
    document.documentElement.dataset.theme = "light";
  });
  window.addEventListener("afterprint", () => {
    document.documentElement.dataset.theme = useAparencia.getState().tema;
  });
}

/** Fator do tamanho do texto (1 = padrão), para medidas que o CSS não alcança (gráficos em SVG, grid). */
export const ESCALA_FONTE: Record<TamanhoFonte, number> = { pequeno: 0.875, padrao: 1, grande: 1.125, extra_grande: 1.25 };
export const useEscalaFonte = () => ESCALA_FONTE[useAparencia((s) => s.fonte)];
