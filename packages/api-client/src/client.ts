import createClient, { type Client } from "openapi-fetch";
import type { LoginRequest, TokenResponse, UsuarioLogado, paths } from "@planogestao/shared-types";

import { exigirDados } from "./errors";
import { criarAcoes } from "./recursos/acoes";
import { criarAdministracao } from "./recursos/administracao";
import { criarCalendario } from "./recursos/calendario";
import { criarDashboard } from "./recursos/dashboard";
import { criarGamificacao } from "./recursos/gamificacao";
import { criarIndicadores } from "./recursos/indicadores";
import { criarItens } from "./recursos/itens";
import { criarMeuPerfil } from "./recursos/meuPerfil";
import { criarMinhasAcoes } from "./recursos/minhasAcoes";
import { criarNotificacoes } from "./recursos/notificacoes";
import { criarDispositivos } from "./recursos/dispositivos";
import { criarEquipes } from "./recursos/equipes";
import { criarPlanos } from "./recursos/planos";
import { criarPreferencias } from "./recursos/preferencias";
import { criarRelatorios } from "./recursos/relatorios";
import { criarUsuarios } from "./recursos/usuarios";

export interface ApiClientConfig {
  baseUrl: string;
  /**
   * "web": refresh token trafega só no cookie httpOnly (credentials: "include").
   * "mobile": refresh token vem no corpo e é guardado pelo app (expo-secure-store).
   */
  clientType: "web" | "mobile";
  /** Access token atual, mantido apenas em memória pelo app. */
  getAccessToken: () => string | null;
  /** Somente mobile: lê o refresh token do armazenamento seguro. */
  getRefreshToken?: () => Promise<string | null>;
  /** Chamado a cada login/refresh bem-sucedido, para o app guardar a nova sessão. */
  onSession: (sessao: TokenResponse) => void | Promise<void>;
  /** Chamado quando o refresh falha (sessão expirada ou revogada). */
  onSessionExpired: () => void;
}

// Rotas que não devem disparar refresh automático em caso de 401.
const ROTAS_SEM_RETRY = ["/auth/login", "/auth/refresh", "/auth/logout"];

export function createApiClient(config: ApiClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const credentials: RequestCredentials = config.clientType === "web" ? "include" : "omit";
  const headersBase: Record<string, string> =
    config.clientType === "mobile" ? { "X-Client-Type": "mobile" } : {};

  let refreshEmAndamento: Promise<TokenResponse | null> | null = null;

  function comToken(request: Request): Request {
    const token = config.getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  }

  async function fetchComRefresh(request: Request): Promise<Response> {
    const copia = request.clone();
    const response = await fetch(comToken(request));
    const semRetry = ROTAS_SEM_RETRY.some((rota) => new URL(request.url).pathname.endsWith(rota));
    if (response.status !== 401 || semRetry) return response;

    const sessao = await renovarSessao();
    if (!sessao) return response;
    return fetch(comToken(copia));
  }

  const http = createClient<paths>({
    baseUrl,
    credentials,
    headers: headersBase,
    fetch: fetchComRefresh,
  });

  async function executarRefresh(): Promise<TokenResponse | null> {
    const refreshToken = config.clientType === "mobile" ? await config.getRefreshToken?.() : null;
    if (config.clientType === "mobile" && !refreshToken) return null;

    const { data, response } = await http.POST("/auth/refresh", {
      body: refreshToken ? { refresh_token: refreshToken } : undefined,
    });
    if (!data) {
      if (response.status === 401) config.onSessionExpired();
      return null;
    }
    await config.onSession(data);
    return data;
  }

  /**
   * Chamadas simultâneas compartilham o mesmo refresh. Isso é essencial porque o
   * backend rotaciona o refresh token: um segundo refresh com o token antigo falharia.
   */
  function renovarSessao(): Promise<TokenResponse | null> {
    refreshEmAndamento ??= executarRefresh().finally(() => {
      refreshEmAndamento = null;
    });
    return refreshEmAndamento;
  }

  const auth = {
    async login(credenciais: LoginRequest): Promise<TokenResponse> {
      const sessao = exigirDados(await http.POST("/auth/login", { body: credenciais }));
      await config.onSession(sessao);
      return sessao;
    },

    /** Restaura/renova a sessão. Retorna null se não houver sessão válida. */
    refresh: renovarSessao,

    async logout(): Promise<void> {
      const refreshToken = config.clientType === "mobile" ? await config.getRefreshToken?.() : null;
      await http.POST("/auth/logout", {
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      });
    },

    async me(): Promise<UsuarioLogado> {
      return exigirDados(await http.GET("/auth/me"));
    },
  };

  return {
    http,
    auth,
    dashboard: criarDashboard(http),
    planos: criarPlanos(http),
    acoes: criarAcoes(http),
    itens: criarItens(http),
    minhasAcoes: criarMinhasAcoes(http),
    calendario: criarCalendario(http),
    indicadores: criarIndicadores(http),
    relatorios: criarRelatorios(http, baseUrl),
    notificacoes: criarNotificacoes(http),
    dispositivos: criarDispositivos(http),
    gamificacao: criarGamificacao(http),
    equipes: criarEquipes(http),
    preferencias: criarPreferencias(http),
    admin: criarAdministracao(http),
    usuarios: criarUsuarios(http),
    meuPerfil: criarMeuPerfil(http, config.onSession),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type HttpClient = Client<paths>;
