import type { FiltrosIndicadores } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

// Mesmas chamadas e parâmetros do web (apps/web/src/hooks/useIndicadores.ts): os números batem por construção.
const opcoes = { placeholderData: keepPreviousData };
const k = (recurso: string, f: FiltrosIndicadores) => ["indicadores", recurso, f] as const;

export const useIndicadoresGerais = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("gerais", f), queryFn: () => api.indicadores.gerais(f), ...opcoes });

export const usePlanosPorStatus = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("planos-status", f), queryFn: () => api.indicadores.planosPorStatus(f), ...opcoes });

/** Situação do prazo dos planos não concluídos (em atraso, a vencer, no prazo). */
export const usePlanosPorPrazo = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("planos-prazo", f), queryFn: () => api.indicadores.planosPorPrazo(f), ...opcoes });

export const useAcoesPorStatus = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("acoes-status", f), queryFn: () => api.indicadores.acoesPorStatus(f), ...opcoes });

export const useCumprimentoPrazo = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("cumprimento", f), queryFn: () => api.indicadores.cumprimentoPrazo(f), ...opcoes });

export const useEvolucaoMensal = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("evolucao", f), queryFn: () => api.indicadores.evolucaoMensal(f), ...opcoes });

export const usePlanosPorSetor = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("planos-setor", f), queryFn: () => api.indicadores.planosPor("setor", f), ...opcoes });

/** Top 10, mesmo limite padrão do web. */
export const useResponsaveisComPendencias = (f: FiltrosIndicadores) =>
  useQuery({ queryKey: k("pendencias", f), queryFn: () => api.indicadores.responsaveisComPendencias(f), ...opcoes });
