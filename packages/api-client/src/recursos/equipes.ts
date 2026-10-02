import type { AdicionarMembros, EquipeSalvar, TipoPeriodo } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados, exigirSucesso } from "../errors";

/** Período do desempenho/indicadores da equipe (padrão do backend: "ano", igual aos Indicadores). */
export interface PeriodoEquipe {
  periodo?: TipoPeriodo;
  data_inicio?: string;
  data_fim?: string;
}

export interface ConsultaEquipes extends PeriodoEquipe {
  q?: string;
  area_id?: number;
  ativo?: boolean;
  page?: number;
  page_size?: number;
}

/** Leitura: equipes:ver. Criar/editar/excluir e membros: equipes:gerenciar (403 para os demais). */
export function criarEquipes(http: HttpClient) {
  const caminho = (equipeId: number) => ({ path: { equipe_id: equipeId } });
  return {
    listar: async (q: ConsultaEquipes = {}) => exigirDados(await http.GET("/equipes", { params: { query: q } })),
    detalhe: async (equipeId: number, p: PeriodoEquipe = {}) =>
      exigirDados(await http.GET("/equipes/{equipe_id}", { params: { ...caminho(equipeId), query: p } })),
    criar: async (body: EquipeSalvar) => exigirDados(await http.POST("/equipes", { body })),
    atualizar: async (equipeId: number, body: EquipeSalvar) =>
      exigirDados(await http.PUT("/equipes/{equipe_id}", { params: caminho(equipeId), body })),
    excluir: async (equipeId: number) => exigirSucesso(await http.DELETE("/equipes/{equipe_id}", { params: caminho(equipeId) })),

    membros: async (equipeId: number) => exigirDados(await http.GET("/equipes/{equipe_id}/membros", { params: caminho(equipeId) })),
    /** Um ou vários usuários; quem já é membro é ignorado (volta em `ja_membros`). */
    adicionarMembros: async (equipeId: number, body: AdicionarMembros) =>
      exigirDados(await http.POST("/equipes/{equipe_id}/membros", { params: caminho(equipeId), body })),
    atualizarMembro: async (equipeId: number, usuarioId: number, papel: string | null) =>
      exigirDados(
        await http.PUT("/equipes/{equipe_id}/membros/{usuario_id}", {
          params: { path: { equipe_id: equipeId, usuario_id: usuarioId } },
          body: { papel_na_equipe: papel },
        }),
      ),
    removerMembro: async (equipeId: number, usuarioId: number) =>
      exigirSucesso(
        await http.DELETE("/equipes/{equipe_id}/membros/{usuario_id}", { params: { path: { equipe_id: equipeId, usuario_id: usuarioId } } }),
      ),

    /** Mesmos cálculos dos Indicadores (Fase 9), recortados pelos membros da equipe. */
    indicadores: async (equipeId: number, p: PeriodoEquipe = {}) =>
      exigirDados(await http.GET("/equipes/{equipe_id}/indicadores", { params: { ...caminho(equipeId), query: p } })),
  };
}
