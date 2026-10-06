import type {
  CategoriaPontuacao,
  ClassificacaoPontuacao,
  PeriodoApuracaoEntrada,
  PremioEntrada,
} from "@planogestao/shared-types";

import { nomeDoArquivo, type ArquivoBaixado } from "../arquivos";
import type { HttpClient } from "../client";
import { ApiError, exigirDados } from "../errors";

/** Mesmos filtros para resumo, ranking e pódio: é o que garante que os números batem. */
export interface FiltrosGamificacao {
  /** Período de apuração. Sem ele, o backend usa o que contém hoje. */
  periodo_id?: number;
  /** Área do colaborador. */
  area_id?: number;
  /** Setor do colaborador. */
  setor_id?: number;
  /** Equipe visível ao usuário: só os participantes dela, com a pontuação geral de cada um. */
  equipe_id?: number;
}

/** Filtros do relatório de auditoria (os mesmos na tela e na exportação). */
export interface FiltrosAuditoria {
  periodo_id?: number;
  categoria?: CategoriaPontuacao;
  usuario_id?: number;
  plano_id?: number;
  acao_id?: number;
  classificacao?: ClassificacaoPontuacao;
}

export function criarGamificacao(http: HttpClient) {
  const q = (filtros: FiltrosGamificacao) => ({ params: { query: filtros } });
  const periodo = (id: number) => ({ params: { path: { periodo_id: id } } });
  return {
    resumo: async (f: FiltrosGamificacao) => exigirDados(await http.GET("/gamificacao/resumo", q(f))),
    /** Pódio (Top 5) da categoria, só com colaboradores suficientes pontuando. */
    podio: async (f: FiltrosGamificacao, categoria: CategoriaPontuacao) =>
      exigirDados(await http.GET("/gamificacao/podio", { params: { query: { ...f, categoria } } })),
    ranking: async (f: FiltrosGamificacao, categoria: CategoriaPontuacao, page = 1, page_size = 10) =>
      exigirDados(await http.GET("/gamificacao/ranking", { params: { query: { ...f, categoria, page, page_size } } })),
    /** Itens que compõem a pontuação de um participante (o próprio, ou com permissão de auditoria). */
    itensDoParticipante: async (usuarioId: number, periodoId?: number, categoria?: CategoriaPontuacao) =>
      exigirDados(await http.GET("/gamificacao/participantes/{usuario_id}", {
        params: { path: { usuario_id: usuarioId }, query: { periodo_id: periodoId, categoria } },
      })),
    regras: async () => exigirDados(await http.GET("/gamificacao/regras")),
    opcoes: async () => exigirDados(await http.GET("/gamificacao/opcoes")),

    periodos: {
      listar: async () => exigirDados(await http.GET("/gamificacao/periodos")),
      criar: async (corpo: PeriodoApuracaoEntrada) => exigirDados(await http.POST("/gamificacao/periodos", { body: corpo })),
      atualizar: async (id: number, corpo: PeriodoApuracaoEntrada) =>
        exigirDados(await http.PUT("/gamificacao/periodos/{periodo_id}", { ...periodo(id), body: corpo })),
      excluir: async (id: number) => {
        const { error, response } = await http.DELETE("/gamificacao/periodos/{periodo_id}", periodo(id));
        if (!response.ok) throw new ApiError(response.status, error);
      },
      gerarTrimestres: async (ano: number) =>
        exigirDados(await http.POST("/gamificacao/periodos/gerar-trimestres", { body: { ano } })),
      definirPremios: async (id: number, premios: PremioEntrada[]) =>
        exigirDados(await http.PUT("/gamificacao/periodos/{periodo_id}/premios", { ...periodo(id), body: { premios } })),
      recalcular: async (id: number) => exigirDados(await http.POST("/gamificacao/periodos/{periodo_id}/recalcular", periodo(id))),
      verificar: async (id: number) => exigirDados(await http.GET("/gamificacao/periodos/{periodo_id}/verificacao", periodo(id))),
      encerrar: async (id: number) => exigirDados(await http.POST("/gamificacao/periodos/{periodo_id}/encerrar", periodo(id))),
      reabrir: async (id: number, justificativa: string) =>
        exigirDados(await http.POST("/gamificacao/periodos/{periodo_id}/reabrir", { ...periodo(id), body: { justificativa } })),
    },

    inconsistencias: async () => exigirDados(await http.GET("/gamificacao/inconsistencias")),
    regularizar: async (corpo: { referencia_tipo: "plano" | "acao"; referencia_id: number; data_conclusao: string; justificativa: string }) =>
      exigirDados(await http.POST("/gamificacao/regularizacoes", { body: corpo })),
    corrigirLancamento: async (lancamentoId: number, justificativa: string) =>
      exigirDados(await http.POST("/gamificacao/lancamentos/{lancamento_id}/corrigir", {
        params: { path: { lancamento_id: lancamentoId } }, body: { justificativa },
      })),

    auditoria: async (f: FiltrosAuditoria) => exigirDados(await http.GET("/gamificacao/auditoria", { params: { query: f } })),
    /** Excel com as mesmas linhas da tela, os totais e o histórico de ajustes. */
    exportarAuditoria: async (f: FiltrosAuditoria): Promise<ArquivoBaixado> => {
      const { data, error, response } = await http.GET("/gamificacao/auditoria/exportar", { params: { query: f }, parseAs: "blob" });
      if (!data) throw new ApiError(response.status, error);
      return { blob: data as unknown as Blob, nomeArquivo: nomeDoArquivo(response, "auditoria_gamificacao.xlsx") };
    },
  };
}
