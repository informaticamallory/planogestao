import { createApiClient } from "@planogestao/api-client";
import { QueryClient } from "@tanstack/react-query";

import { API_BASE_URL } from "../config/api";
import { useAuthStore } from "../store/authStore";
import { sessaoSegura } from "./sessaoSegura";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

/**
 * Mesmo client do web, em modo "mobile": o refresh token vem no corpo da resposta
 * (header X-Client-Type: mobile) e é guardado no SecureStore. O api-client já faz:
 * - refresh automático ao receber 401 (e reenvia a requisição);
 * - refreshes simultâneos compartilhados (o backend rotaciona o refresh token);
 * - onSessionExpired quando o refresh é recusado → logout local.
 */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  clientType: "mobile",
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => sessaoSegura.lerRefreshToken(),
  onSession: async (sessao) => {
    if (sessao.refresh_token) await sessaoSegura.salvarRefreshToken(sessao.refresh_token);
    useAuthStore.getState().definirSessao(sessao);
  },
  onSessionExpired: () => {
    void sessaoSegura.apagarRefreshToken();
    useAuthStore.getState().encerrarSessao();
    queryClient.clear();
  },
});
