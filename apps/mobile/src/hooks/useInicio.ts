import type { TipoPeriodo } from "@planogestao/shared-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

/** Mesmo endpoint e mesmos parâmetros do Dashboard web: os números batem. */
export const useResumoDashboard = (periodo: TipoPeriodo) =>
  useQuery({
    queryKey: ["dashboard", "resumo", periodo],
    queryFn: () => api.dashboard.resumo({ periodo }),
    // Ao trocar o período, mantém os números anteriores até os novos chegarem (sem piscar para "—").
    placeholderData: keepPreviousData,
  });

/** Minhas ações com prazo hoje (o "hoje" é decidido no servidor, no fuso do negócio). */
export const useAcoesDeHoje = (habilitado: boolean) =>
  useQuery({
    queryKey: ["minhas-acoes", "hoje"],
    queryFn: () => api.minhasAcoes.listar({ prazo: "hoje", page_size: 20 }),
    enabled: habilitado,
  });
