import { StyleSheet } from "react-native";

/**
 * Tokens provisórios do app (aproximação em hex dos tokens claros do Mallory DS — o React Native
 * não entende oklch). A identidade visual do mobile é uma fase própria; aqui só o necessário.
 */
export const cores = {
  fundo: "#faf8f4",
  fundo2: "#f3f1ec",
  superficie: "#ffffff",
  texto: "#1f2835",
  textoSuave: "#6b7482",
  textoSutil: "#949ba6",
  borda: "#e4e6ea",
  primaria: "#ff6600",
  primariaTexto: "#ffffff",
  primariaSuave: "#fff1e6",
  primariaSuaveTexto: "#b8480f",
  perigo: "#dc3b26",
  perigoSuave: "#fdebe8",
  aviso: "#9a6a00",
  avisoSuave: "#fff6db",
  tinta: "#101921",
  info: "#2a82c9",
  infoSuave: "#e6f2fb",
  sucesso: "#1e9d62",
  sucessoSuave: "#e5f6ee",
  violeta: "#a2459e",
  violetaSuave: "#f6e9f5",
} as const;

/** Cores de dados (mesma semântica do web: tokens --cor-dado-*). Sempre acompanhadas de texto. */
export const coresDados = {
  em_andamento: cores.info,
  atrasada: cores.perigo,
  concluida: cores.sucesso,
  pendente: cores.violeta,
  vencendo: cores.aviso,
  neutro: cores.textoSutil,
  // Ardósia azulada: distinta do cinza de "cancelado" (neutro) e do violeta de "pendente".
  nao_iniciado: "#8a9bb5",
} as const;

export const espaco = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const raio = { sm: 8, md: 12, lg: 16, xl: 20 } as const;

// ---- tamanho do texto (preferência da conta: Meu Perfil no web, lida em /auth/me) -----------------

export type TamanhoFonte = "pequeno" | "padrao" | "grande" | "extra_grande";

const FONTE_PADRAO = { xs: 11, sm: 12, base: 14, md: 16, lg: 18, xl: 22, titulo: 26 } as const;
const ESCALAS: Record<TamanhoFonte, number> = { pequeno: 0.875, padrao: 1, grande: 1.125, extra_grande: 1.25 };

let escala = 1;
// Muda a cada troca de escala: os estilosDinamicos refazem a folha na próxima renderização.
let versao = 0;

/** Tamanhos de texto já na escala do usuário. Lidos na renderização (e pelos estilosDinamicos). */
export const fonte: Record<keyof typeof FONTE_PADRAO, number> = { ...FONTE_PADRAO };

/** Medida de texto fora da escala `fonte` (ex.: lineHeight): valor do tamanho padrão × escala. */
export const escalarTexto = (n: number) => Math.round(n * escala);

/**
 * Chamado no login e na restauração da sessão (authStore). As telas que abrem depois disso já
 * nascem na escala nova; as que estiverem abertas se ajustam na próxima renderização.
 */
export function definirTamanhoFonte(tamanho: TamanhoFonte) {
  const nova = ESCALAS[tamanho] ?? 1;
  if (nova === escala) return;
  escala = nova;
  for (const k of Object.keys(FONTE_PADRAO) as (keyof typeof FONTE_PADRAO)[]) fonte[k] = Math.round(FONTE_PADRAO[k] * escala);
  versao++;
}

/**
 * Como StyleSheet.create, mas refaz a folha quando o tamanho do texto muda (a de StyleSheet.create
 * é criada uma vez, na carga do arquivo, e congelaria os tamanhos). Uso: `estilosDinamicos(() => ({ … }))`.
 */
export function estilosDinamicos<T extends StyleSheet.NamedStyles<T>>(fabrica: () => T & StyleSheet.NamedStyles<any>): T {
  let cache: T | null = null;
  let versaoCache = -1;
  return new Proxy({} as T, {
    get(_, chave) {
      if (cache === null || versaoCache !== versao) {
        cache = StyleSheet.create(fabrica());
        versaoCache = versao;
      }
      return cache[chave as keyof T];
    },
  });
}
