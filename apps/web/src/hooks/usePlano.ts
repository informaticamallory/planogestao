/** Consultas e mutações de um plano específico (tela de detalhe e edição). */
import type { AcaoCriar, PlanoAtualizar } from "@planogestao/shared-types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";
import { baixarArquivo } from "../utils/download";

// Tudo do plano fica sob ["plano", id]: uma mutação invalida o conjunto de uma vez.
const chave = (planoId: number, recurso: string) => ["plano", planoId, recurso] as const;

export const usePlanoDetalhe = (planoId: number) =>
  useQuery({ queryKey: chave(planoId, "detalhe"), queryFn: () => api.planos.detalhe(planoId) });

export const usePlanoIndicadores = (planoId: number) =>
  useQuery({ queryKey: chave(planoId, "indicadores"), queryFn: () => api.planos.indicadores(planoId) });

export const useAcoesDoPlano = (planoId: number, ativo = true) =>
  useQuery({ queryKey: chave(planoId, "acoes"), queryFn: () => api.planos.acoes(planoId), enabled: ativo });

export const useAnexosDoPlano = (planoId: number) =>
  useQuery({ queryKey: chave(planoId, "anexos"), queryFn: () => api.planos.listarAnexos(planoId) });

const TAMANHO_PAGINA_HISTORICO = 30;

export const useHistoricoPlano = (planoId: number) =>
  useInfiniteQuery({
    queryKey: chave(planoId, "historico"),
    queryFn: ({ pageParam }) => api.planos.historico(planoId, pageParam, TAMANHO_PAGINA_HISTORICO),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.page * ultima.page_size < ultima.total ? ultima.page + 1 : undefined),
  });

/** Após alterar um plano, recarrega o plano inteiro e as visões agregadas. */
function useInvalidarPlano(planoId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["plano", planoId] });
    queryClient.invalidateQueries({ queryKey: ["planos"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useAtualizarPlano(planoId: number) {
  const invalidar = useInvalidarPlano(planoId);
  return useMutation({
    mutationFn: (dados: PlanoAtualizar) => api.planos.atualizar(planoId, dados),
    onSuccess: invalidar,
  });
}

export function useArquivamentoPlano(planoId: number) {
  const invalidar = useInvalidarPlano(planoId);
  return useMutation({
    mutationFn: (arquivar: boolean) => (arquivar ? api.planos.arquivar(planoId) : api.planos.desarquivar(planoId)),
    onSuccess: invalidar,
  });
}

export function useAdicionarAcoes(planoId: number) {
  const invalidar = useInvalidarPlano(planoId);
  return useMutation({
    mutationFn: (acoes: AcaoCriar[]) => api.planos.adicionarAcoes(planoId, acoes),
    onSuccess: invalidar,
  });
}

export function useEnviarAnexos(planoId: number) {
  const invalidar = useInvalidarPlano(planoId);
  return useMutation({
    mutationFn: (arquivos: File[]) => api.planos.enviarAnexos(planoId, arquivos),
    onSuccess: invalidar,
  });
}

export function useBaixarAnexo(planoId: number) {
  return useMutation({
    mutationFn: async (anexoId: number) => {
      const arquivo = await api.planos.baixarAnexo(planoId, anexoId);
      baixarArquivo(arquivo.blob, arquivo.nomeArquivo);
    },
  });
}
