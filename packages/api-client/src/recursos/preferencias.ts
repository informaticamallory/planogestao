import type { Tela, WidgetLayout } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

/** Personalização de widgets do usuário logado (visibilidade e ordem). */
export function criarPreferencias(http: HttpClient) {
  const caminho = (tela: Tela) => ({ path: { tela } });
  return {
    /** Configuração salva, ou o padrão (todos visíveis, ordem original) se nunca personalizou. */
    obter: async (tela: Tela) => exigirDados(await http.GET("/preferencias/{tela}", { params: caminho(tela) })),
    salvar: async (tela: Tela, widgets: WidgetLayout[]) =>
      exigirDados(await http.PUT("/preferencias/{tela}", { params: caminho(tela), body: { widgets } })),
    /** Remove a personalização e devolve o layout padrão. */
    restaurar: async (tela: Tela) => exigirDados(await http.DELETE("/preferencias/{tela}", { params: caminho(tela) })),
  };
}
