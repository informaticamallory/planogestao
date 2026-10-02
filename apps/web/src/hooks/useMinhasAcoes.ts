import type { SituacaoMinhaAcao } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

export const useResumoMinhasAcoes = () =>
  useQuery({ queryKey: ["minhas-acoes", "resumo"], queryFn: () => api.minhasAcoes.resumo() });

export const useListaMinhasAcoes = (consulta: { situacao?: SituacaoMinhaAcao; page: number; page_size: number }) =>
  useQuery({
    queryKey: ["minhas-acoes", "lista", consulta],
    queryFn: () => api.minhasAcoes.listar(consulta),
    placeholderData: keepPreviousData,
  });
