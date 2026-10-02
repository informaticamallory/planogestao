import { ApiError } from "@planogestao/api-client";
import type { LoginRequest } from "@planogestao/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

import { API_BASE_URL } from "../config/api";
import { api, queryClient } from "../services/api";
import { removerPush } from "../services/push";
import { sessaoSegura } from "../services/sessaoSegura";
import { useAuthStore } from "../store/authStore";

/** Falha de rede (sem internet ou servidor inacessível): o fetch rejeita sem resposta HTTP. */
export function ehErroDeRede(erro: unknown): boolean {
  return !(erro instanceof ApiError) || erro.status === 0;
}

export function mensagemDeErro(erro: unknown): string {
  if (ehErroDeRede(erro)) {
    return __DEV__
      ? `Não foi possível conectar ao servidor (${API_BASE_URL}). Verifique a conexão e se a API está no ar.`
      : "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  }
  return (erro as ApiError).message;
}

export function useLogin() {
  return useMutation({
    mutationFn: (credenciais: LoginRequest) => api.auth.login(credenciais),
  });
}

export function useLogout() {
  return useMutation({
    // Primeiro desliga o push deste aparelho (ainda com a sessão válida); falha aqui não impede sair.
    mutationFn: async () => {
      await removerPush().catch(() => undefined);
      return api.auth.logout();
    },
    // Mesmo sem conexão, a sessão local é encerrada e o refresh token apagado do aparelho.
    onSettled: async () => {
      await sessaoSegura.apagarRefreshToken();
      useAuthStore.getState().encerrarSessao();
      queryClient.clear();
    },
  });
}

/**
 * Ao abrir o app (e ao tocar em "Tentar novamente"): se há refresh token salvo, renova a sessão.
 * Sem rede, não desloga: vai para "sem_conexao" e mantém o token para tentar de novo.
 */
export function useRestaurarSessao() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "verificando") return;
    let cancelado = false;
    (async () => {
      const token = await sessaoSegura.lerRefreshToken();
      if (!token) return useAuthStore.getState().encerrarSessao();
      try {
        const sessao = await api.auth.refresh();
        if (!sessao && !cancelado) useAuthStore.getState().encerrarSessao();
      } catch (erro) {
        if (cancelado) return;
        if (ehErroDeRede(erro)) useAuthStore.getState().marcarSemConexao();
        else useAuthStore.getState().encerrarSessao();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [status]);

  return status;
}
