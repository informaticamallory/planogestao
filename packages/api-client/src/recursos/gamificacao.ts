import type { TipoPeriodo } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

/** Mesmos filtros para resumo, ranking e pódio: é o que garante que os números batem. */
export interface FiltrosGamificacao {
  periodo: TipoPeriodo;
  data_inicio?: string;
  data_fim?: string;
  /** Área do colaborador. */
  area_id?: number;
  /** Setor do colaborador. */
  setor_id?: number;
  /** Equipe cadastrada (módulo Equipes): só os membros dela. */
  equipe_id?: number;
}

export function criarGamificacao(http: HttpClient) {
  const q = (filtros: FiltrosGamificacao) => ({ params: { query: filtros } });
  return {
    resumo: async (f: FiltrosGamificacao) => exigirDados(await http.GET("/gamificacao/resumo", q(f))),
    top3: async (f: FiltrosGamificacao) => exigirDados(await http.GET("/gamificacao/top3", q(f))),
    ranking: async (f: FiltrosGamificacao, page = 1, page_size = 10) =>
      exigirDados(await http.GET("/gamificacao/ranking", { params: { query: { ...f, page, page_size } } })),
    regras: async () => exigirDados(await http.GET("/gamificacao/regras")),
    opcoes: async () => exigirDados(await http.GET("/gamificacao/opcoes")),
  };
}
