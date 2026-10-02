import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

export function criarUsuarios(http: HttpClient) {
  return {
    /** Usuários ativos (id, nome, área) para escolher responsáveis. */
    buscar: async (termo: string, limite = 20) =>
      exigirDados(await http.GET("/usuarios/opcoes", { params: { query: { q: termo, limite } } })),
  };
}
