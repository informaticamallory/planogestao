import type { FiltrosAuditoria, FiltrosGamificacao } from "@planogestao/api-client";
import type { CategoriaPontuacao } from "@planogestao/shared-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

// Resumo, pódio e ranking carregam os mesmos filtros na chave: trocar um filtro recalcula os três juntos.
const opcoes = { placeholderData: keepPreviousData };
const k = (recurso: string, f: FiltrosGamificacao, ...extra: unknown[]) => ["gamificacao", recurso, f, ...extra] as const;

export const useResumoGamificacao = (f: FiltrosGamificacao, habilitado = true) =>
  useQuery({ queryKey: k("resumo", f), queryFn: () => api.gamificacao.resumo(f), enabled: habilitado, ...opcoes });

export const usePodio = (f: FiltrosGamificacao, categoria: CategoriaPontuacao, habilitado = true) =>
  useQuery({ queryKey: k("podio", f, categoria), queryFn: () => api.gamificacao.podio(f, categoria), enabled: habilitado, ...opcoes });

export const useRanking = (f: FiltrosGamificacao, categoria: CategoriaPontuacao, page: number, pageSize: number, habilitado = true) =>
  useQuery({
    queryKey: k("ranking", f, categoria, page, pageSize),
    queryFn: () => api.gamificacao.ranking(f, categoria, page, pageSize),
    enabled: habilitado,
    ...opcoes,
  });

export const useItensParticipante = (usuarioId: number | null, periodoId: number | undefined, categoria: CategoriaPontuacao) =>
  useQuery({
    queryKey: ["gamificacao", "participante", usuarioId, periodoId, categoria],
    queryFn: () => api.gamificacao.itensDoParticipante(usuarioId!, periodoId, categoria),
    enabled: usuarioId !== null,
  });

export const useRegrasPontuacao = () =>
  useQuery({ queryKey: ["gamificacao", "regras"], queryFn: api.gamificacao.regras, staleTime: 5 * 60_000 });

export const useOpcoesGamificacao = () =>
  useQuery({ queryKey: ["gamificacao", "opcoes"], queryFn: api.gamificacao.opcoes, staleTime: 5 * 60_000 });

export const usePeriodosApuracao = () => useQuery({ queryKey: ["gamificacao", "periodos"], queryFn: api.gamificacao.periodos.listar });

export const useVerificacaoEncerramento = (periodoId: number | null) =>
  useQuery({
    queryKey: ["gamificacao", "verificacao", periodoId],
    queryFn: () => api.gamificacao.periodos.verificar(periodoId!),
    enabled: periodoId !== null,
  });

export const useInconsistencias = (habilitado: boolean) =>
  useQuery({ queryKey: ["gamificacao", "inconsistencias"], queryFn: api.gamificacao.inconsistencias, enabled: habilitado });

export const useAuditoriaPontuacao = (f: FiltrosAuditoria) =>
  useQuery({ queryKey: ["gamificacao", "auditoria", f], queryFn: () => api.gamificacao.auditoria(f), ...opcoes });

/** Botão "Atualizar": busca de novo tudo do painel. */
export function useAtualizarGamificacao() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["gamificacao"] });
}

/** Qualquer alteração de apuração (período, prêmio, encerramento, correção) recarrega tudo da gamificação. */
export function useMutacaoGamificacao<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ["gamificacao"] }) });
}
