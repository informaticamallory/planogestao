import type { TokenResponse, UsuarioLogado } from "@planogestao/shared-types";
import { create } from "zustand";

import { definirTamanhoFonte } from "../theme";

/**
 * - verificando: abrindo o app, tentando restaurar a sessão pelo refresh token salvo;
 * - sem_conexao: há sessão salva, mas não deu para falar com o servidor (não desloga por falta de rede);
 * - autenticado / anonimo.
 */
export type StatusSessao = "verificando" | "sem_conexao" | "autenticado" | "anonimo";

interface AuthState {
  status: StatusSessao;
  /** Somente em memória. */
  accessToken: string | null;
  usuario: UsuarioLogado | null;
  definirSessao: (sessao: TokenResponse) => void;
  encerrarSessao: () => void;
  marcarSemConexao: () => void;
  voltarAVerificar: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "verificando",
  accessToken: null,
  usuario: null,
  definirSessao: (sessao) => {
    // Tamanho do texto é da conta (Meu Perfil no web): o app acompanha em todo login/restauração.
    definirTamanhoFonte(sessao.usuario.tamanho_fonte);
    set({ status: "autenticado", accessToken: sessao.access_token, usuario: sessao.usuario });
  },
  encerrarSessao: () => set({ status: "anonimo", accessToken: null, usuario: null }),
  marcarSemConexao: () => set({ status: "sem_conexao" }),
  voltarAVerificar: () => set({ status: "verificando" }),
}));

export function temPermissao(usuario: UsuarioLogado | null, codigo: string): boolean {
  return !!usuario?.permissoes.includes(codigo);
}
