import { createApiClient } from "@planogestao/api-client";

import { useAuthStore } from "../store/authStore";
import { API_URL } from "../utils/urlApi";

export const api = createApiClient({
  baseUrl: API_URL,
  clientType: "web",
  getAccessToken: () => useAuthStore.getState().accessToken,
  onSession: (sessao) => useAuthStore.getState().definirSessao(sessao),
  onSessionExpired: () => useAuthStore.getState().encerrarSessao(),
});
