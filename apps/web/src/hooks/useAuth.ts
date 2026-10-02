import type { LoginRequest } from "@planogestao/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../services/api";
import { useAuthStore } from "../store/authStore";

export function useLogin() {
  return useMutation({
    mutationFn: (credenciais: LoginRequest) => api.auth.login(credenciais),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const encerrarSessao = useAuthStore((s) => s.encerrarSessao);

  return useMutation({
    mutationFn: () => api.auth.logout(),
    // Mesmo se a chamada falhar (ex.: servidor fora), a sessão local é encerrada.
    onSettled: () => {
      encerrarSessao();
      queryClient.clear();
    },
  });
}

/** Ao abrir o app, tenta restaurar a sessão pelo cookie httpOnly de refresh. */
export function useRestaurarSessao() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "verificando") return;
    api.auth
      .refresh()
      .then((sessao) => {
        if (!sessao) useAuthStore.getState().encerrarSessao();
      })
      .catch(() => useAuthStore.getState().encerrarSessao());
  }, [status]);

  return status;
}
