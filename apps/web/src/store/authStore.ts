import type { TokenResponse, UsuarioLogado } from "@planogestao/shared-types";
import { create } from "zustand";

import { useAparencia } from "./aparenciaStore";

type StatusSessao = "verificando" | "autenticado" | "anonimo";

interface AuthState {
  status: StatusSessao;
  /** Mantido só em memória: some ao recarregar e é restaurado via refresh (cookie httpOnly). */
  accessToken: string | null;
  usuario: UsuarioLogado | null;
  definirSessao: (sessao: TokenResponse) => void;
  /** Dados do próprio usuário alterados em Meu Perfil (nome, foto, aparência). */
  atualizarUsuario: (usuario: UsuarioLogado) => void;
  encerrarSessao: () => void;
}

// A aparência é da conta: segue o usuário logado em qualquer dispositivo.
const aplicarAparencia = (u: UsuarioLogado) => useAparencia.getState().aplicarDaConta(u.tema, u.cor_destaque, u.tamanho_fonte);

export const useAuthStore = create<AuthState>((set) => ({
  status: "verificando",
  accessToken: null,
  usuario: null,
  definirSessao: (sessao) => {
    aplicarAparencia(sessao.usuario);
    set({ status: "autenticado", accessToken: sessao.access_token, usuario: sessao.usuario });
  },
  atualizarUsuario: (usuario) => {
    aplicarAparencia(usuario);
    set({ usuario });
  },
  encerrarSessao: () => set({ status: "anonimo", accessToken: null, usuario: null }),
}));

export function temPermissao(usuario: UsuarioLogado | null, codigo: string): boolean {
  return !!usuario?.permissoes.includes(codigo);
}
