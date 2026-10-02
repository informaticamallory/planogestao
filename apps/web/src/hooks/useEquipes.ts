import type { ConsultaEquipes, PeriodoEquipe } from "@planogestao/api-client";
import type { AdicionarMembros, EquipeSalvar } from "@planogestao/shared-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

export const useEquipes = (consulta: ConsultaEquipes) =>
  useQuery({ queryKey: ["equipes", "lista", consulta], queryFn: () => api.equipes.listar(consulta), placeholderData: keepPreviousData });

export const useEquipe = (equipeId: number, periodo: PeriodoEquipe = {}) =>
  useQuery({ queryKey: ["equipes", equipeId, "detalhe", periodo], queryFn: () => api.equipes.detalhe(equipeId, periodo), enabled: Number.isFinite(equipeId) });

export const useMembrosEquipe = (equipeId: number) =>
  useQuery({ queryKey: ["equipes", equipeId, "membros"], queryFn: () => api.equipes.membros(equipeId), enabled: Number.isFinite(equipeId) });

export const useIndicadoresEquipe = (equipeId: number, periodo: PeriodoEquipe) =>
  useQuery({
    queryKey: ["equipes", equipeId, "indicadores", periodo],
    queryFn: () => api.equipes.indicadores(equipeId, periodo),
    placeholderData: keepPreviousData,
    enabled: Number.isFinite(equipeId),
  });

/**
 * Qualquer mudança em equipes/membros recarrega o módulo e a Gamificação (o filtro "Equipe" e o
 * ranking por equipe dependem dos membros) e a listagem de planos (filtro por equipe).
 */
function useInvalidarEquipes() {
  const qc = useQueryClient();
  return () => {
    for (const chave of [["equipes"], ["gamificacao"], ["planos", "lista"]]) void qc.invalidateQueries({ queryKey: chave });
  };
}

export function useSalvarEquipe() {
  const invalidar = useInvalidarEquipes();
  return useMutation({
    mutationFn: ({ id, corpo }: { id: number | null; corpo: EquipeSalvar }) => (id ? api.equipes.atualizar(id, corpo) : api.equipes.criar(corpo)),
    onSuccess: invalidar,
  });
}

export function useExcluirEquipe() {
  const invalidar = useInvalidarEquipes();
  return useMutation({ mutationFn: (id: number) => api.equipes.excluir(id), onSuccess: invalidar });
}

export function useAdicionarMembros(equipeId: number) {
  const invalidar = useInvalidarEquipes();
  return useMutation({ mutationFn: (corpo: AdicionarMembros) => api.equipes.adicionarMembros(equipeId, corpo), onSuccess: invalidar });
}

export function useAtualizarMembro(equipeId: number) {
  const invalidar = useInvalidarEquipes();
  return useMutation({
    mutationFn: ({ usuarioId, papel }: { usuarioId: number; papel: string | null }) => api.equipes.atualizarMembro(equipeId, usuarioId, papel),
    onSuccess: invalidar,
  });
}

export function useRemoverMembro(equipeId: number) {
  const invalidar = useInvalidarEquipes();
  return useMutation({ mutationFn: (usuarioId: number) => api.equipes.removerMembro(equipeId, usuarioId), onSuccess: invalidar });
}
