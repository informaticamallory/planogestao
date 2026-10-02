import type { ConsultaPlanos } from "@planogestao/api-client";
import type { FormatoExportacao, PlanoCriar } from "@planogestao/shared-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";
import { baixarArquivo } from "../utils/download";

export const usePlanos = (consulta: ConsultaPlanos) =>
  useQuery({
    queryKey: ["planos", "lista", consulta],
    queryFn: () => api.planos.listar(consulta),
    placeholderData: keepPreviousData,
  });

/** Origens compatíveis com o tipo escolhido no formulário (Administração › Tipos de Plano). */
export const useOrigensDoTipo = (tipoId: number | null) =>
  useQuery({
    queryKey: ["planos", "origens-do-tipo", tipoId],
    queryFn: () => api.planos.origensDoTipo(tipoId!),
    enabled: tipoId !== null,
    staleTime: 5 * 60_000,
  });

export const useOpcoesPlanos = () =>
  useQuery({
    queryKey: ["planos", "opcoes"],
    queryFn: () => api.planos.opcoes(),
    // Cadastros mudam pouco; evita refazer a chamada a cada abertura do drawer.
    staleTime: 5 * 60 * 1000,
  });

export function useExportarPlanos() {
  return useMutation({
    mutationFn: async ({ consulta, formato }: { consulta: ConsultaPlanos; formato: FormatoExportacao }) => {
      const arquivo = await api.planos.exportar(consulta, formato);
      baixarArquivo(arquivo.blob, arquivo.nomeArquivo);
    },
  });
}

/**
 * Cria o plano (com as ações, numa transação) e depois envia os anexos.
 * Se só o envio dos anexos falhar, o plano já existe: o erro volta em `erroAnexos`.
 */
export function useCriarPlano() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ corpo, anexos }: { corpo: PlanoCriar; anexos: File[] }) => {
      const criado = await api.planos.criar(corpo);
      let erroAnexos: string | null = null;
      if (anexos.length) {
        try {
          await api.planos.enviarAnexos(criado.plano.id, anexos);
        } catch (erro) {
          erroAnexos = erro instanceof Error ? erro.message : "Falha ao enviar anexos.";
        }
      }
      return { criado, erroAnexos };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArquivarPlano() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planoId, arquivar }: { planoId: number; arquivar: boolean }) =>
      arquivar ? api.planos.arquivar(planoId) : api.planos.desarquivar(planoId),
    onSuccess: () => {
      // Arquivar muda listagens e indicadores.
      queryClient.invalidateQueries({ queryKey: ["planos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
