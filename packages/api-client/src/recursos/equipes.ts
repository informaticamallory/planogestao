import type { EquipeSalvar } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados, exigirSucesso } from "../errors";

export interface ConsultaEquipes {
  /** Nome da equipe. */
  q?: string;
  /** Código ou nome do plano. */
  plano?: string;
  plano_id?: number;
  /** Área do plano. */
  area_id?: number;
  situacao?: "ativas" | "inativas" | "sem_plano";
  page?: number;
  page_size?: number;
}

/**
 * Equipes vinculadas a planos. Leitura: equipes:ver (equipes das quais participa ou que gerencia).
 * Criar/editar/excluir: equipes:gerenciar + gerir o plano (403/422 para os demais).
 */
export function criarEquipes(http: HttpClient) {
  const caminho = (equipeId: number) => ({ path: { equipe_id: equipeId } });
  return {
    listar: async (q: ConsultaEquipes = {}) => exigirDados(await http.GET("/equipes", { params: { query: q } })),
    detalhe: async (equipeId: number) => exigirDados(await http.GET("/equipes/{equipe_id}", { params: caminho(equipeId) })),
    criar: async (body: EquipeSalvar) => exigirDados(await http.POST("/equipes", { body })),
    atualizar: async (equipeId: number, body: EquipeSalvar) =>
      exigirDados(await http.PUT("/equipes/{equipe_id}", { params: caminho(equipeId), body })),
    alterarSituacao: async (equipeId: number, ativo: boolean) =>
      exigirDados(await http.PATCH("/equipes/{equipe_id}/situacao", { params: caminho(equipeId), body: { ativo } })),
    excluir: async (equipeId: number) => exigirSucesso(await http.DELETE("/equipes/{equipe_id}", { params: caminho(equipeId) })),
    historico: async (equipeId: number) => exigirDados(await http.GET("/equipes/{equipe_id}/historico", { params: caminho(equipeId) })),
    /** Só as ações principais do plano vinculado atribuídas aos participantes (critério na resposta). */
    desempenho: async (equipeId: number) => exigirDados(await http.GET("/equipes/{equipe_id}/desempenho", { params: caminho(equipeId) })),
    /** Planos ativos cujas equipes o usuário gerencia (busca por código ou nome). */
    planosGerenciaveis: async (q: { q?: string; plano_id?: number } = {}) =>
      exigirDados(await http.GET("/equipes/opcoes/planos", { params: { query: q } })),
    /** Usuários que podem entrar na equipe do plano (ou da equipe sem plano), por nome ou e-mail. */
    candidatos: async (q: { plano_id?: number; equipe_id?: number; q?: string }) =>
      exigirDados(await http.GET("/equipes/opcoes/participantes", { params: { query: q } })),
  };
}
