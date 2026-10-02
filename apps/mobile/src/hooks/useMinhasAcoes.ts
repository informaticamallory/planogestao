import type { SituacaoMinhaAcao } from "@planogestao/api-client";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

const TAMANHO_PAGINA = 20;

/** Contadores dos chips. Mesma expressão de situação da listagem (os números batem). */
export const useResumoMinhasAcoes = () =>
  useQuery({ queryKey: ["minhas-acoes", "resumo"], queryFn: () => api.minhasAcoes.resumo() });

/** GET /minhas-acoes em páginas; sem situação = todas (mais urgentes primeiro, ordem do servidor). */
export function useMinhasAcoesInfinito(situacao: SituacaoMinhaAcao | undefined) {
  return useInfiniteQuery({
    queryKey: ["minhas-acoes", "lista", situacao ?? "todas"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.minhasAcoes.listar({ situacao, page: pageParam, page_size: TAMANHO_PAGINA }),
    getNextPageParam: (ultima) => (ultima.page * ultima.page_size < ultima.total ? ultima.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}
