import type { TipoPeriodo } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

/** Filtros comuns: definem o conjunto de planos analisado por todos os indicadores. */
export interface FiltrosIndicadores {
  periodo: TipoPeriodo;
  data_inicio?: string;
  data_fim?: string;
  area_id?: number;
  setor_id?: number;
  /** Responsável pelo plano. */
  responsavel_id?: number;
}

export type DimensaoPlanos = "area" | "setor" | "responsavel" | "prioridade";

export function criarIndicadores(http: HttpClient) {
  const q = (filtros: FiltrosIndicadores) => ({ params: { query: filtros } });
  return {
    gerais: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/gerais", q(f))),
    planosPorStatus: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/planos-por-status", q(f))),
    /** Situação do prazo dos planos não concluídos (em atraso, a vencer, no prazo). */
    planosPorPrazo: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/planos-por-prazo", q(f))),
    acoesPorStatus: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/acoes-por-status", q(f))),
    cumprimentoPrazo: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/cumprimento-prazo", q(f))),
    evolucaoMensal: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/evolucao-mensal", q(f))),
    /** Ações principais e sub-itens de todos os níveis (cada item uma vez). */
    itensPorNivel: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/itens-por-nivel", q(f))),
    subitensPorResponsavel: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/subitens-por-responsavel", q(f))),
    itensPorPlano: async (f: FiltrosIndicadores) => exigirDados(await http.GET("/indicadores/itens-por-plano", q(f))),

    planosPor: async (dimensao: DimensaoPlanos, f: FiltrosIndicadores) => {
      const caminhos = {
        area: "/indicadores/planos-por-area",
        setor: "/indicadores/planos-por-setor",
        responsavel: "/indicadores/planos-por-responsavel",
        prioridade: "/indicadores/planos-por-prioridade",
      } as const;
      return exigirDados(await http.GET(caminhos[dimensao], q(f)));
    },

    responsaveisComPendencias: async (f: FiltrosIndicadores, limite = 10) =>
      exigirDados(
        await http.GET("/indicadores/responsaveis-com-pendencias", { params: { query: { ...f, limite } } }),
      ),
  };
}
