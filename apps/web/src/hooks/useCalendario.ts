import type { FiltrosCalendario } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

// Tudo sob ["calendario"]: mudanças em ações invalidam o calendário inteiro.
export const useCalendarioMensal = (ano: number, mes: number, filtros: FiltrosCalendario, habilitado = true) =>
  useQuery({
    queryKey: ["calendario", "mes", ano, mes, filtros],
    queryFn: () => api.calendario.mensal(ano, mes, filtros),
    placeholderData: keepPreviousData,
    enabled: habilitado,
  });

export const useCalendarioIntervalo = (inicio: string, fim: string, filtros: FiltrosCalendario, habilitado = true) =>
  useQuery({
    queryKey: ["calendario", "intervalo", inicio, fim, filtros],
    queryFn: () => api.calendario.intervalo(inicio, fim, filtros),
    placeholderData: keepPreviousData,
    enabled: habilitado,
  });

export const useCalendarioDia = (data: string | null, filtros: FiltrosCalendario) =>
  useQuery({
    queryKey: ["calendario", "dia", data, filtros],
    queryFn: () => api.calendario.dia(data!, filtros),
    enabled: data !== null,
  });
