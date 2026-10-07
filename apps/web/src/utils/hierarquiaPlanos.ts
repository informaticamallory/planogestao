/**
 * Navegação pela hierarquia dos planos: Todos os planos → Plano → Ação → Sub-item…
 * O "Voltar" e o caminho seguem os vínculos reais (plano, ação pai), nunca a última página visitada.
 *
 * Única memória: a busca da listagem de planos (filtros, ordenação, página), para "Todos os planos" reabrir a
 * lista como estava. Fica no sessionStorage desta aba, por usuário (só os parâmetros da URL; sem dados de negócio):
 * quem entrar depois na mesma aba não herda os filtros de outra pessoa.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

const chaveLista = (usuarioId: number | undefined) => `planogestao:lista-planos:${usuarioId ?? "anonimo"}`;

/** Montado no AppLayout: guarda a busca sempre que a listagem de planos está aberta. */
export function useLembrarListaPlanos() {
  const { pathname, search } = useLocation();
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  useEffect(() => {
    if (pathname !== "/planos" || usuarioId === undefined) return;
    try {
      sessionStorage.setItem(chaveLista(usuarioId), search);
    } catch {
      // Storage indisponível (janela privada, bloqueio): a listagem padrão continua valendo.
    }
  }, [pathname, search, usuarioId]);
}

/** "Todos os planos": a listagem com o estado salvo, ou a padrão. */
export function caminhoListaPlanos(): string {
  try {
    const busca = sessionStorage.getItem(chaveLista(useAuthStore.getState().usuario?.id));
    return busca && busca.startsWith("?") ? `/planos${busca}` : "/planos";
  } catch {
    return "/planos";
  }
}

export const ROTULO_LISTA_PLANOS = "Todos os planos";
