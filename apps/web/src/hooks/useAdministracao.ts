import type { ConsultaUsuariosAdmin } from "@planogestao/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

export const useUsuariosAdmin = (consulta: ConsultaUsuariosAdmin) =>
  useQuery({ queryKey: ["admin", "usuarios", consulta], queryFn: () => api.admin.usuarios.listar(consulta), placeholderData: keepPreviousData });

export const usePerfisAdmin = () => useQuery({ queryKey: ["admin", "perfis"], queryFn: api.admin.perfis.listar });

export const useCatalogoPermissoes = () =>
  useQuery({ queryKey: ["admin", "perfis", "catalogo"], queryFn: api.admin.perfis.catalogo, staleTime: 10 * 60_000 });

export const useAreasAdmin = () => useQuery({ queryKey: ["admin", "areas"], queryFn: api.admin.areas.listar });

export const useSetoresAdmin = () => useQuery({ queryKey: ["admin", "setores"], queryFn: () => api.admin.setores.listar() });

export const useTiposPlanoAdmin = () => useQuery({ queryKey: ["admin", "tipos-plano"], queryFn: api.admin.tiposPlano.listar });

export const useOrigensAdmin = () => useQuery({ queryKey: ["admin", "origens"], queryFn: api.admin.origens.listar });

export const useEmailConfig = () => useQuery({ queryKey: ["admin", "email"], queryFn: api.admin.email.obter });

export const useConfiguracoesAdmin = () => useQuery({ queryKey: ["admin", "configuracoes"], queryFn: api.admin.configuracoes.listar });

/** Parâmetros globais para textos da interface (qualquer usuário logado). */
export const useConfiguracoesPublicas = () =>
  useQuery({ queryKey: ["configuracoes", "publicas"], queryFn: api.admin.configuracoes.publicas, staleTime: 5 * 60_000 });

/**
 * Mutação de cadastro: ao concluir, recarrega a Administração e tudo que usa esses cadastros
 * (opções do formulário de planos, filtros da gamificação, textos que dependem das configurações).
 */
export function useMutacaoAdmin<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // Inclui as origens por tipo do formulário do plano (compatibilidade editada em Tipos de Plano).
      for (const chave of [["admin"], ["planos", "opcoes"], ["planos", "origens-do-tipo"], ["gamificacao", "opcoes"], ["configuracoes"]]) {
        void qc.invalidateQueries({ queryKey: chave });
      }
    },
  });
}
