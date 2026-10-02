import type { AcaoAtualizar, AcaoCriar, ResponderSolicitacao, SolicitarAlteracao } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export function criarAcoes(http: HttpClient) {
  const caminho = (acaoId: number) => ({ params: { path: { acao_id: acaoId } } });

  return {
    detalhe: async (acaoId: number) => exigirDados(await http.GET("/acoes/{acao_id}", caminho(acaoId))),

    /** Atualização parcial: envie só os campos alterados. */
    atualizar: async (acaoId: number, dados: AcaoAtualizar) =>
      exigirDados(await http.PUT("/acoes/{acao_id}", { ...caminho(acaoId), body: dados })),

    historico: async (acaoId: number) => exigirDados(await http.GET("/acoes/{acao_id}/historico", caminho(acaoId))),

    aceitar: async (acaoId: number) => exigirDados(await http.POST("/acoes/{acao_id}/aceitar", caminho(acaoId))),

    /** Gestor volta uma ação concluída para em andamento; o status do plano é recalculado. */
    reabrir: async (acaoId: number, justificativa: string) =>
      exigirDados(await http.POST("/acoes/{acao_id}/reabrir", { ...caminho(acaoId), body: { justificativa } })),

    /**
     * Desdobra um item (de qualquer nível) em subações — mesmo corpo da inclusão de ações.
     * Devolve as subações criadas (numeração 1.1, 1.1.1…) e avisos.
     */
    criarSubacoes: async (acaoId: number, itens: AcaoCriar[]) =>
      exigirDados(await http.POST("/acoes/{acao_id}/subacoes", { ...caminho(acaoId), body: itens })),

    solicitarAlteracao: async (acaoId: number, dados: SolicitarAlteracao) =>
      exigirDados(await http.POST("/acoes/{acao_id}/solicitar-alteracao", { ...caminho(acaoId), body: dados })),

    responderSolicitacao: async (acaoId: number, solicitacaoId: number, dados: ResponderSolicitacao) =>
      exigirDados(
        await http.POST("/acoes/{acao_id}/solicitacoes/{solicitacao_id}/responder", {
          params: { path: { acao_id: acaoId, solicitacao_id: solicitacaoId } },
          body: dados,
        }),
      ),
  };
}
