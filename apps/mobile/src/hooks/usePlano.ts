import { useQuery } from "@tanstack/react-query";

import { api } from "../services/api";

// Mesmas chaves do web (["plano", id, ...]): mudanças numa ação invalidam o plano dela.
export const usePlanoDetalhe = (planoId: number) =>
  useQuery({ queryKey: ["plano", planoId, "detalhe"], queryFn: () => api.planos.detalhe(planoId), enabled: Number.isFinite(planoId) });

export const useAcoesDoPlano = (planoId: number) =>
  useQuery({ queryKey: ["plano", planoId, "acoes"], queryFn: () => api.planos.acoes(planoId), enabled: Number.isFinite(planoId) });
