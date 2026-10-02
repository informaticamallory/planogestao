import type { AcaoAtualizar, AcaoDetalhe, ResponderSolicitacao, SolicitarAlteracao } from "@planogestao/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

const chave = (acaoId: number, recurso: string) => ["acao", acaoId, recurso] as const;

export const useAcaoDetalhe = (acaoId: number) =>
  useQuery({ queryKey: chave(acaoId, "detalhe"), queryFn: () => api.acoes.detalhe(acaoId), enabled: Number.isFinite(acaoId) });

export const useHistoricoAcao = (acaoId: number) =>
  useQuery({ queryKey: chave(acaoId, "historico"), queryFn: () => api.acoes.historico(acaoId), enabled: Number.isFinite(acaoId) });

/** Mesmo efeito do web: a resposta já é o detalhe novo; o resto (listas, contadores, histórico) é recarregado. */
function useAoAlterarAcao(acaoId: number) {
  const queryClient = useQueryClient();
  return (acao: AcaoDetalhe) => {
    queryClient.setQueryData(chave(acaoId, "detalhe"), acao);
    // Todas as ações: mudar uma subação altera a principal (subações em aberto) e vice-versa (aguardando).
    void queryClient.invalidateQueries({ queryKey: ["acao"] });
    void queryClient.invalidateQueries({ queryKey: ["minhas-acoes"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["planos"] });
    void queryClient.invalidateQueries({ queryKey: ["plano", acao.plano.id] });
    void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    void queryClient.invalidateQueries({ queryKey: ["calendario"] });
  };
}

export function useAtualizarAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({
    mutationFn: (dados: AcaoAtualizar) => api.acoes.atualizar(acaoId, dados),
    onSuccess: (r) => aoAlterar(r.acao),
  });
}

export function useAceitarAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({ mutationFn: () => api.acoes.aceitar(acaoId), onSuccess: aoAlterar });
}

/** Gestor volta uma ação concluída para em andamento (justificativa obrigatória, mín. 5 caracteres). */
export function useReabrirAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({ mutationFn: (justificativa: string) => api.acoes.reabrir(acaoId, justificativa), onSuccess: aoAlterar });
}

export function useSolicitarAlteracao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({
    mutationFn: (dados: SolicitarAlteracao) => api.acoes.solicitarAlteracao(acaoId, dados),
    onSuccess: aoAlterar,
  });
}

export function useResponderSolicitacao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({
    mutationFn: ({ solicitacaoId, ...dados }: ResponderSolicitacao & { solicitacaoId: number }) =>
      api.acoes.responderSolicitacao(acaoId, solicitacaoId, dados),
    onSuccess: aoAlterar,
  });
}
