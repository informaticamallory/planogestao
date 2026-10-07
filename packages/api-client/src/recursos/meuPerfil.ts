import type {
  AjusteFoto,
  PreferenciaNotificacaoSalvar,
  TokenResponse,
  TrocarSenha,
  UsuarioSelfUpdate,
} from "@planogestao/shared-types";

import type { HttpClient } from "../client";
import { exigirDados } from "../errors";

// Mesmo padrão do backend (app/core/foto.py): quadrado arredondado, centralizado, sem zoom.
const AJUSTE_PADRAO: AjusteFoto = { formato: "quadrado", encaixe: "preencher", x: 0.5, y: 0.5, zoom: 1 };

/**
 * Meu Perfil: o próprio usuário sobre a sua conta (nome, aparência, foto, senha).
 * Perfil de acesso, área e e-mail NÃO passam por aqui — o backend rejeita (422); são da Administração.
 */
export function criarMeuPerfil(http: HttpClient, onSession: (sessao: TokenResponse) => void | Promise<void>) {
  return {
    /** Envie só o que mudou. `cor_destaque: null` volta à cor padrão. Devolve o usuário logado atualizado. */
    atualizar: async (dados: UsuarioSelfUpdate) => exigirDados(await http.PUT("/usuarios/me", { body: dados })),

    /**
     * JPEG, PNG ou WebP de até 5 MB, guardada inteira (sem recorte), com o enquadramento feito no editor.
     * Foto e ajuste vão juntos: cancelar o editor não envia nada.
     */
    enviarFoto: async (arquivo: File | Blob, ajuste: AjusteFoto = AJUSTE_PADRAO) =>
      exigirDados(
        await http.POST("/usuarios/me/foto", {
          // O schema tipa o arquivo como string (binário); o corpo real é multipart.
          body: { arquivo: arquivo as unknown as string, ...ajuste },
          bodySerializer: () => {
            const form = new FormData();
            form.append("arquivo", arquivo);
            for (const [k, v] of Object.entries(ajuste)) form.append(k, String(v));
            return form;
          },
        }),
      ),

    /** Só o enquadramento da foto atual (formato, encaixe, posição, zoom). */
    ajustarFoto: async (ajuste: AjusteFoto) => exigirDados(await http.PUT("/usuarios/me/foto/ajuste", { body: ajuste })),

    removerFoto: async () => exigirDados(await http.DELETE("/usuarios/me/foto")),

    /** Canais (sistema/e-mail) de cada aviso operacional; sem escolha salva, vem o padrão do tipo. */
    preferenciasNotificacao: async () => exigirDados(await http.GET("/usuarios/me/preferencias-notificacao")),

    /** Grava os tipos enviados (os demais ficam como estão). */
    salvarPreferenciasNotificacao: async (itens: PreferenciaNotificacaoSalvar[]) =>
      exigirDados(await http.PUT("/usuarios/me/preferencias-notificacao", { body: itens })),

    /** Encerra as sessões dos outros dispositivos; esta recebe uma sessão nova (repassada ao app). */
    trocarSenha: async (dados: TrocarSenha) => {
      const sessao = exigirDados(await http.PUT("/usuarios/me/senha", { body: dados }));
      await onSession(sessao);
      return sessao;
    },
  };
}
