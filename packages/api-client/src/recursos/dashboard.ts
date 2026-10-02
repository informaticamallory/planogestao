import type { TipoPeriodo } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export interface FiltroPeriodo {
  periodo: TipoPeriodo;
  /** YYYY-MM-DD; obrigatório (junto com data_fim) quando periodo = "personalizado". */
  data_inicio?: string;
  data_fim?: string;
}

export function criarDashboard(http: HttpClient) {
  return {
    resumo: async (filtro: FiltroPeriodo) =>
      exigirDados(await http.GET("/dashboard/resumo", { params: { query: filtro } })),

    evolucaoPlanos: async (filtro: FiltroPeriodo) =>
      exigirDados(await http.GET("/dashboard/evolucao-planos", { params: { query: filtro } })),

    statusAcoes: async (filtro: FiltroPeriodo) =>
      exigirDados(await http.GET("/dashboard/status-acoes", { params: { query: filtro } })),

    planosRecentes: async (filtro: FiltroPeriodo, limite?: number) =>
      exigirDados(await http.GET("/dashboard/planos-recentes", { params: { query: { ...filtro, limite } } })),

    atividadesRecentes: async (filtro: FiltroPeriodo, limite?: number) =>
      exigirDados(await http.GET("/dashboard/atividades-recentes", { params: { query: { ...filtro, limite } } })),

    minhasAcoes: async (limite?: number) =>
      exigirDados(await http.GET("/dashboard/minhas-acoes", { params: { query: { limite } } })),

    calendario: async (ano: number, mes: number) =>
      exigirDados(await http.GET("/dashboard/calendario", { params: { query: { ano, mes } } })),
  };
}
