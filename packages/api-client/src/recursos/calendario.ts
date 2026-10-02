import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export interface FiltrosCalendario {
  area_id?: number;
  responsavel_id?: number;
}

export function criarCalendario(http: HttpClient) {
  return {
    mensal: async (ano: number, mes: number, filtros: FiltrosCalendario) =>
      exigirDados(await http.GET("/calendario", { params: { query: { ano, mes, ...filtros } } })),

    /** `data` no formato YYYY-MM-DD. */
    dia: async (data: string, filtros: FiltrosCalendario) =>
      exigirDados(await http.GET("/calendario/dia", { params: { query: { data, ...filtros } } })),

    /** Intervalo de até 62 dias (visões Semana e Lista). */
    intervalo: async (inicio: string, fim: string, filtros: FiltrosCalendario) =>
      exigirDados(await http.GET("/calendario/acoes", { params: { query: { inicio, fim, ...filtros } } })),
  };
}
