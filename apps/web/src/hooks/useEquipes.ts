import type { ConsultaEquipes } from "@planogestao/api-client";
import type { EquipeSalvar } from "@planogestao/shared-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

export const useEquipes = (consulta: ConsultaEquipes, ativo = true) =>
  useQuery({
    queryKey: ["equipes", "lista", consulta],
    queryFn: () => api.equipes.listar(consulta),
    placeholderData: keepPreviousData,
    enabled: ativo,
  });

export const useArvoreEquipes = (consulta: Omit<ConsultaEquipes, "page" | "page_size">, ativo = true) =>
  useQuery({
    queryKey: ["equipes", "arvore", consulta],
    queryFn: () => api.equipes.arvore(consulta),
    placeholderData: keepPreviousData,
    enabled: ativo,
  });

export const useEquipe = (equipeId: number) =>
  useQuery({ queryKey: ["equipes", equipeId, "detalhe"], queryFn: () => api.equipes.detalhe(equipeId), enabled: Number.isFinite(equipeId) });

export const useHistoricoEquipe = (equipeId: number) =>
  useQuery({ queryKey: ["equipes", equipeId, "historico"], queryFn: () => api.equipes.historico(equipeId) });

export const useDesempenhoEquipe = (equipeId: number) =>
  useQuery({ queryKey: ["equipes", equipeId, "desempenho"], queryFn: () => api.equipes.desempenho(equipeId) });

/**
 * Mudança em equipes recarrega o módulo, a Gamificação (filtro "Equipe") e os planos: participar de uma equipe
 * ativa dá leitura do plano, então a lista de planos e o detalhe podem mudar.
 */
function useInvalidarEquipes() {
  const qc = useQueryClient();
  return () => {
    for (const chave of [["equipes"], ["gamificacao"], ["planos"], ["plano"]]) void qc.invalidateQueries({ queryKey: chave });
  };
}

export function useSalvarEquipe() {
  const invalidar = useInvalidarEquipes();
  return useMutation({
    mutationFn: ({ id, corpo }: { id: number | null; corpo: EquipeSalvar }) => (id ? api.equipes.atualizar(id, corpo) : api.equipes.criar(corpo)),
    onSuccess: invalidar,
  });
}

export function useSituacaoEquipe() {
  const invalidar = useInvalidarEquipes();
  return useMutation({ mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) => api.equipes.alterarSituacao(id, ativo), onSuccess: invalidar });
}

export function useExcluirEquipe() {
  const invalidar = useInvalidarEquipes();
  return useMutation({ mutationFn: (id: number) => api.equipes.excluir(id), onSuccess: invalidar });
}
