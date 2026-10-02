import type { AcaoAtualizar, AcaoCriar, AcaoDetalhe, ResponderSolicitacao, SolicitarAlteracao } from "@planogestao/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";

const chave = (acaoId: number, recurso: string) => ["acao", acaoId, recurso] as const;

export const useAcaoDetalhe = (acaoId: number) =>
  useQuery({ queryKey: chave(acaoId, "detalhe"), queryFn: () => api.acoes.detalhe(acaoId) });

export const useHistoricoAcao = (acaoId: number) =>
  useQuery({ queryKey: chave(acaoId, "historico"), queryFn: () => api.acoes.historico(acaoId) });

/** Mudanças na ação afetam o plano (indicadores, timeline), listagens e dashboard. */
function useAoAlterarAcao(acaoId: number) {
  const queryClient = useQueryClient();
  return (acao: AcaoDetalhe) => {
    queryClient.setQueryData(chave(acaoId, "detalhe"), acao);
    // Todas as ações: concluir um pré-requisito libera dependentes; subações mudam a principal.
    queryClient.invalidateQueries({ queryKey: ["acao"] });
    queryClient.invalidateQueries({ queryKey: ["plano", acao.plano.id] });
    queryClient.invalidateQueries({ queryKey: ["planos"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["indicadores"] });
    queryClient.invalidateQueries({ queryKey: ["itens"] });
    queryClient.invalidateQueries({ queryKey: ["minhas-acoes"] });
    queryClient.invalidateQueries({ queryKey: ["calendario"] });
  };
}

export function useAtualizarAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({
    mutationFn: (dados: AcaoAtualizar) => api.acoes.atualizar(acaoId, dados),
    onSuccess: (r) => aoAlterar(r.acao),
  });
}

/** Cria subações (mesmo corpo das ações) no item `acaoId`, de qualquer nível; recarrega árvore e painéis. */
export function useCriarSubacoes(acaoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itens: AcaoCriar[]) => api.acoes.criarSubacoes(acaoId, itens),
    onSuccess: () => {
      for (const k of [["acao"], ["plano"], ["planos"], ["itens"], ["minhas-acoes"], ["calendario"], ["dashboard"], ["indicadores"]]) {
        queryClient.invalidateQueries({ queryKey: k });
      }
    },
  });
}

export function useReabrirAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({ mutationFn: (justificativa: string) => api.acoes.reabrir(acaoId, justificativa), onSuccess: aoAlterar });
}

export function useAceitarAcao(acaoId: number) {
  const aoAlterar = useAoAlterarAcao(acaoId);
  return useMutation({ mutationFn: () => api.acoes.aceitar(acaoId), onSuccess: aoAlterar });
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
