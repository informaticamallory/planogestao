import type { ConsultaNotificacoes } from "@planogestao/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { api } from "../services/api";
import { useAuthStore } from "../store/authStore";

/** Intervalo do polling do sino (WebSocket fica como melhoria futura). */
export const INTERVALO_POLLING_MS = 30_000;

/**
 * Contagem de não lidas, consultada a cada 30 s (só com a aba visível).
 * Quando o número sobe, recarrega listas e telas afetadas pelas mudanças que geraram a notificação.
 */
export function useContagemNotificacoes() {
  const queryClient = useQueryClient();
  const autenticado = useAuthStore((s) => s.status === "autenticado");
  const consulta = useQuery({
    queryKey: ["notificacoes", "contagem"],
    queryFn: () => api.notificacoes.contagem(),
    enabled: autenticado,
    refetchInterval: INTERVALO_POLLING_MS,
    refetchIntervalInBackground: false,
  });

  const anterior = useRef<number | undefined>(undefined);
  const atual = consulta.data?.nao_lidas;
  useEffect(() => {
    if (atual !== undefined && anterior.current !== undefined && atual > anterior.current) {
      queryClient.invalidateQueries({ queryKey: ["notificacoes", "lista"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-acoes"] });
    }
    anterior.current = atual;
  }, [atual, queryClient]);

  return consulta;
}

export const useListaNotificacoes = (consulta: ConsultaNotificacoes, habilitado = true) =>
  useQuery({
    queryKey: ["notificacoes", "lista", consulta],
    queryFn: () => api.notificacoes.listar(consulta),
    enabled: habilitado,
    placeholderData: keepPreviousData,
  });

function useAtualizarNotificacoes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
}

export function useMarcarLida() {
  const atualizar = useAtualizarNotificacoes();
  return useMutation({ mutationFn: (id: number) => api.notificacoes.marcarLida(id), onSuccess: atualizar });
}

export function useMarcarTodas() {
  const atualizar = useAtualizarNotificacoes();
  return useMutation({ mutationFn: (tipo?: string[]) => api.notificacoes.marcarTodas(tipo), onSuccess: atualizar });
}
