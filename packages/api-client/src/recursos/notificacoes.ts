import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export interface ConsultaNotificacoes {
  tipo?: string[];
  lida?: boolean;
  page?: number;
  page_size?: number;
}

export function criarNotificacoes(http: HttpClient) {
  return {
    listar: async (consulta: ConsultaNotificacoes = {}) =>
      exigirDados(await http.GET("/notificacoes", { params: { query: consulta } })),

    /** Só o número de não lidas: leve, para o polling do sino. */
    contagem: async () => exigirDados(await http.GET("/notificacoes/contagem")),

    marcarLida: async (id: number) =>
      exigirDados(await http.PATCH("/notificacoes/{notificacao_id}/ler", { params: { path: { notificacao_id: id } } })),

    marcarTodas: async (tipo?: string[]) =>
      exigirDados(await http.PATCH("/notificacoes/ler-todas", { params: { query: { tipo } } })),
  };
}
