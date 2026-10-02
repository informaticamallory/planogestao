import type { ConsultaUsuariosAdmin } from "@planogestao/api-client";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

// Mesmas chaves do web (apps/web/src/hooks/useAdministracao.ts).
export function useUsuariosAdmin(consulta: Omit<ConsultaUsuariosAdmin, "page" | "page_size">) {
  return useInfiniteQuery({
    queryKey: ["admin", "usuarios", "lista", consulta],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.admin.usuarios.listar({ ...consulta, page: pageParam, page_size: 30 }),
    getNextPageParam: (u) => (u.page * u.page_size < u.total ? u.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

export const useUsuarioAdmin = (id: number | null) =>
  useQuery({ queryKey: ["admin", "usuarios", "detalhe", id], queryFn: () => api.admin.usuarios.detalhe(id!), enabled: id !== null });

export const usePerfisAdmin = () => useQuery({ queryKey: ["admin", "perfis"], queryFn: api.admin.perfis.listar });
export const useCatalogoPermissoes = () =>
  useQuery({ queryKey: ["admin", "perfis", "catalogo"], queryFn: api.admin.perfis.catalogo, staleTime: 10 * 60_000 });
export const useAreasAdmin = () => useQuery({ queryKey: ["admin", "areas"], queryFn: api.admin.areas.listar });
export const useSetoresAdmin = () => useQuery({ queryKey: ["admin", "setores"], queryFn: () => api.admin.setores.listar() });
export const useTiposPlanoAdmin = () => useQuery({ queryKey: ["admin", "tipos-plano"], queryFn: api.admin.tiposPlano.listar });
export const useConfiguracoesAdmin = () => useQuery({ queryKey: ["admin", "configuracoes"], queryFn: api.admin.configuracoes.listar });

/** Toda alteração administrativa recarrega as listas do módulo e as opções usadas no resto do app. */
export function useMutacaoAdmin<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const chave of [["admin"], ["opcoes"], ["configuracoes"]]) void qc.invalidateQueries({ queryKey: chave });
    },
  });
}
