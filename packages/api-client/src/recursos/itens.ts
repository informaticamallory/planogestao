import type { operations } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export type ConsultaItens = NonNullable<operations["listar_itens_get"]["parameters"]["query"]>;
/** Filtros da listagem de itens (ações principais + sub-itens de todos os níveis), sem a paginação. */
export type FiltrosItens = Omit<ConsultaItens, "page" | "page_size">;

export function criarItens(http: HttpClient) {
  return {
    listar: async (consulta: ConsultaItens) => exigirDados(await http.GET("/itens", { params: { query: consulta } })),
  };
}
