import type { NotificacaoItem, PaginaNotificacoes } from "@planogestao/shared-types";
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

const TAMANHO_PAGINA = 20;

/** Só o número de não lidas (endpoint leve), para o badge da aba. */
export const useContagemNotificacoes = (habilitado: boolean) =>
  useQuery({
    queryKey: ["notificacoes", "contagem"],
    queryFn: () => api.notificacoes.contagem(),
    enabled: habilitado,
    refetchInterval: 60_000,
  });

export function useNotificacoesInfinito(apenasNaoLidas: boolean) {
  return useInfiniteQuery({
    queryKey: ["notificacoes", "lista", apenasNaoLidas ? "nao_lidas" : "todas"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.notificacoes.listar({ lida: apenasNaoLidas ? false : undefined, page: pageParam, page_size: TAMANHO_PAGINA }),
    getNextPageParam: (ultima) => (ultima.page * ultima.page_size < ultima.total ? ultima.page + 1 : undefined),
  });
}

export function useMarcarLida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.notificacoes.marcarLida(id),
    onSuccess: (lida: NotificacaoItem) => {
      // Marca na lista em cache na hora (sem esperar o refetch) e recarrega os contadores.
      queryClient.setQueriesData<InfiniteData<PaginaNotificacoes>>({ queryKey: ["notificacoes", "lista"] }, (dados) =>
        dados
          ? { ...dados, pages: dados.pages.map((p) => ({ ...p, items: p.items.map((n) => (n.id === lida.id ? lida : n)) })) }
          : dados,
      );
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    },
  });
}

export function useMarcarTodasLidas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notificacoes.marcarTodas(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notificacoes"] }),
  });
}
