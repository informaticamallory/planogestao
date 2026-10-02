import type { TokenResponse, TrocarSenha, UsuarioSelfUpdate } from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

/**
 * Meu Perfil: o próprio usuário sobre a sua conta (nome, aparência, foto, senha).
 * Perfil de acesso, área e e-mail NÃO passam por aqui — o backend rejeita (422); são da Administração.
 */
export function criarMeuPerfil(http: HttpClient, onSession: (sessao: TokenResponse) => void | Promise<void>) {
  return {
    /** Envie só o que mudou. `cor_destaque: null` volta à cor padrão. Devolve o usuário logado atualizado. */
    atualizar: async (dados: UsuarioSelfUpdate) => exigirDados(await http.PUT("/usuarios/me", { body: dados })),

    /** JPEG, PNG ou WebP de até 5 MB; o backend recorta e reduz para 256 px. */
    enviarFoto: async (arquivo: File | Blob) =>
      exigirDados(
        await http.POST("/usuarios/me/foto", {
          // O schema tipa o arquivo como string (binário); o corpo real é multipart.
          body: { arquivo: arquivo as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append("arquivo", arquivo);
            return form;
          },
        }),
      ),

    removerFoto: async () => exigirDados(await http.DELETE("/usuarios/me/foto")),

    /** Encerra as sessões dos outros dispositivos; esta recebe uma sessão nova (repassada ao app). */
    trocarSenha: async (dados: TrocarSenha) => {
      const sessao = exigirDados(await http.PUT("/usuarios/me/senha", { body: dados }));
      await onSession(sessao);
      return sessao;
    },
  };
}
