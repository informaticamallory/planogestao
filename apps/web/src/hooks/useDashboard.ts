import type { FiltroPeriodo } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

// Chaves começam com "dashboard" para invalidar tudo de uma vez quando dados mudarem.
const chave = (recurso: string, ...args: unknown[]) => ["dashboard", recurso, ...args] as const;

// keepPreviousData: ao trocar o período, o conteúdo antigo continua na tela até o novo chegar.
const opcoesPeriodo = { placeholderData: keepPreviousData };

export const useResumoDashboard = (filtro: FiltroPeriodo) =>
  useQuery({ queryKey: chave("resumo", filtro), queryFn: () => api.dashboard.resumo(filtro), ...opcoesPeriodo });

export const useEvolucaoPlanos = (filtro: FiltroPeriodo) =>
  useQuery({ queryKey: chave("evolucao", filtro), queryFn: () => api.dashboard.evolucaoPlanos(filtro), ...opcoesPeriodo });

export const useStatusAcoes = (filtro: FiltroPeriodo) =>
  useQuery({ queryKey: chave("status-acoes", filtro), queryFn: () => api.dashboard.statusAcoes(filtro), ...opcoesPeriodo });

export const usePlanosRecentes = (filtro: FiltroPeriodo) =>
  useQuery({ queryKey: chave("planos-recentes", filtro), queryFn: () => api.dashboard.planosRecentes(filtro), ...opcoesPeriodo });

export const useAtividadesRecentes = (filtro: FiltroPeriodo) =>
  useQuery({
    queryKey: chave("atividades", filtro),
    queryFn: () => api.dashboard.atividadesRecentes(filtro),
    ...opcoesPeriodo,
  });

export const useMinhasAcoes = () =>
  useQuery({ queryKey: chave("minhas-acoes"), queryFn: () => api.dashboard.minhasAcoes() });

export const useCalendarioMes = (ano: number, mes: number) =>
  useQuery({ queryKey: chave("calendario", ano, mes), queryFn: () => api.dashboard.calendario(ano, mes), ...opcoesPeriodo });
