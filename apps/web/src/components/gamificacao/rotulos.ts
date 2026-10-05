import type { CategoriaPontuacao, ItemPontuacao, PeriodoApuracao, PremioSaida } from "@planogestao/shared-types";

import type { BadgeTom } from "../ui/Badge";

export const ROTULO_SITUACAO: Record<PeriodoApuracao["situacao"], string> = { planejado: "Planejado", aberto: "Aberto", encerrado: "Encerrado" };
export const TOM_SITUACAO: Record<PeriodoApuracao["situacao"], BadgeTom> = { planejado: "neutro", aberto: "info", encerrado: "sucesso" };
export const ROTULO_CATEGORIA: Record<CategoriaPontuacao, string> = { gestor: "Gestor", executor: "Executor" };

export const ROTULO_CLASSIFICACAO: Record<ItemPontuacao["classificacao"], string> = {
  plano_concluido: "Plano concluído",
  acao_no_prazo: "Ação dentro do prazo",
  acao_fora_do_prazo: "Ação fora do prazo",
};

export const ROTULO_EVENTO: Record<string, string> = {
  reversao: "Reversão",
  mantido: "Reabertura de item (pontuação mantida)",
  recalculo: "Recálculo",
  correcao: "Correção",
  regularizacao: "Regularização",
  encerramento: "Encerramento",
  reabertura: "Reabertura do período",
  periodo: "Período",
  premios: "Prêmios",
};

/** Como o lançamento nasceu (rastreabilidade). */
export const ROTULO_ORIGEM: Record<string, string> = {
  automatico: "Automático",
  recalculo: "Recálculo",
  correcao: "Correção",
  regularizacao: "Regularização",
  migracao: "Migração",
};

export const moeda = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function textoPremio(p: PremioSaida) {
  return [p.nome, p.valor !== null && p.valor !== undefined ? moeda(p.valor) : null].filter(Boolean).join(" · ");
}
