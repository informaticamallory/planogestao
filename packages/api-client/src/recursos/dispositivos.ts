import type { RegistrarToken } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

/** Token de push do app mobile (Expo). */
export function criarDispositivos(http: HttpClient) {
  return {
    registrarToken: async (dados: RegistrarToken) =>
      exigirDados(await http.POST("/dispositivos/registrar-token", { body: dados })),

    /** No logout: o aparelho para de receber push deste usuário. */
    removerToken: async (token: string) =>
      exigirDados(await http.POST("/dispositivos/remover-token", { body: { token } })),
  };
}
