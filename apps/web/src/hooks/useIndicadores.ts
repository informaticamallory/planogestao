import type { DimensaoPlanos, FiltrosIndicadores } from "@planogestao/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

// Todas as consultas carregam os mesmos filtros na chave: trocar um filtro refaz todos os gráficos.
const opcoes = { placeholderData: keepPreviousData };
const k = (recurso: string, f: FiltrosIndicadores, ...extra: unknown[]) => ["indicadores", recurso, f, ...extra] as const;

// `ativo = false`: não consulta.
export const useIndicadoresGerais = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("gerais", f), queryFn: () => api.indicadores.gerais(f), enabled: ativo, ...opcoes });

export const usePlanosPorStatus = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("planos-status", f), queryFn: () => api.indicadores.planosPorStatus(f), enabled: ativo, ...opcoes });

export const usePlanosPorPrazo = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("planos-prazo", f), queryFn: () => api.indicadores.planosPorPrazo(f), enabled: ativo, ...opcoes });

export const useAcoesPorStatus = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("acoes-status", f), queryFn: () => api.indicadores.acoesPorStatus(f), enabled: ativo, ...opcoes });

export const useCumprimentoPrazo = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("cumprimento", f), queryFn: () => api.indicadores.cumprimentoPrazo(f), enabled: ativo, ...opcoes });

export const useEvolucaoMensal = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("evolucao", f), queryFn: () => api.indicadores.evolucaoMensal(f), enabled: ativo, ...opcoes });

export const useItensPorNivel = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("itens-nivel", f), queryFn: () => api.indicadores.itensPorNivel(f), enabled: ativo, ...opcoes });

export const useSubitensPorResponsavel = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("subitens-responsavel", f), queryFn: () => api.indicadores.subitensPorResponsavel(f), enabled: ativo, ...opcoes });

export const useItensPorPlano = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("itens-plano", f), queryFn: () => api.indicadores.itensPorPlano(f), enabled: ativo, ...opcoes });

export const usePlanosPor = (dimensao: DimensaoPlanos, f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("planos-por", f, dimensao), queryFn: () => api.indicadores.planosPor(dimensao, f), enabled: ativo, ...opcoes });

export const useResponsaveisComPendencias = (f: FiltrosIndicadores, ativo = true) =>
  useQuery({ queryKey: k("pendencias", f), queryFn: () => api.indicadores.responsaveisComPendencias(f), enabled: ativo, ...opcoes });
