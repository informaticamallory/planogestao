import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export type SituacaoMinhaAcao = "atrasada" | "vencendo" | "em_andamento" | "concluida";

export function criarMinhasAcoes(http: HttpClient) {
  return {
    resumo: async () => exigirDados(await http.GET("/minhas-acoes/resumo")),

    /** `prazo: "hoje"` = ações com prazo hoje (a data é decidida no servidor). */
    listar: async (consulta: { situacao?: SituacaoMinhaAcao; prazo?: "hoje"; page?: number; page_size?: number }) =>
      exigirDados(await http.GET("/minhas-acoes", { params: { query: consulta } })),
  };
}
