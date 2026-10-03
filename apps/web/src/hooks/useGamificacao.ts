import type { FiltrosGamificacao } from "@planogestao/api-client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

// Resumo, pódio e ranking carregam os mesmos filtros na chave: trocar um filtro recalcula os três juntos.
const opcoes = { placeholderData: keepPreviousData };
const k = (recurso: string, f: FiltrosGamificacao, ...extra: unknown[]) => ["gamificacao", recurso, f, ...extra] as const;

export const useResumoGamificacao = (f: FiltrosGamificacao) =>
  useQuery({ queryKey: k("resumo", f), queryFn: () => api.gamificacao.resumo(f), ...opcoes });

export const usePodio = (f: FiltrosGamificacao) =>
  useQuery({ queryKey: k("podio", f), queryFn: () => api.gamificacao.podio(f), ...opcoes });

export const useRanking = (f: FiltrosGamificacao, page: number, pageSize: number) =>
  useQuery({ queryKey: k("ranking", f, page, pageSize), queryFn: () => api.gamificacao.ranking(f, page, pageSize), ...opcoes });

export const useRegrasPontuacao = () =>
  useQuery({ queryKey: ["gamificacao", "regras"], queryFn: api.gamificacao.regras, staleTime: 5 * 60_000 });

export const useOpcoesGamificacao = () =>
  useQuery({ queryKey: ["gamificacao", "opcoes"], queryFn: api.gamificacao.opcoes, staleTime: 5 * 60_000 });

/** Botão "Atualizar": busca de novo tudo do painel. */
export function useAtualizarGamificacao() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["gamificacao"] });
}
