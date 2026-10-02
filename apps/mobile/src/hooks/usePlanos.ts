import type { StatusFiltroPlano, TagPrazo, TipoPeriodo } from "@planogestao/shared-types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

const TAMANHO_PAGINA = 20;

export interface FiltroPlanos {
  status?: StatusFiltroPlano;
  /** Tag de prazo do fim estimado (independente do status). */
  prazo?: TagPrazo;
  periodo?: TipoPeriodo;
}

/** Áreas, setores e responsáveis (GET /opcoes/planos), para os filtros. Muda pouco: cache de 5 min. */
export const useOpcoesPlanos = () =>
  useQuery({ queryKey: ["opcoes", "planos"], queryFn: () => api.planos.opcoes(), staleTime: 5 * 60_000 });

/** GET /planos com os mesmos filtros do drill-down do Dashboard web, em páginas (rolagem infinita). */
export function usePlanosInfinito(filtro: FiltroPlanos) {
  return useInfiniteQuery({
    queryKey: ["planos", "lista", filtro],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.planos.listar({
        status: filtro.status ? [filtro.status] : undefined,
        prazo: filtro.prazo ? [filtro.prazo] : undefined,
        periodo: filtro.periodo,
        page: pageParam,
        page_size: TAMANHO_PAGINA,
      }),
    getNextPageParam: (ultima) => (ultima.page * ultima.page_size < ultima.total ? ultima.page + 1 : undefined),
  });
}
