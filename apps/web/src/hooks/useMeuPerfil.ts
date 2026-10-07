import type {
  AjusteFoto,
  CorDestaque,
  PreferenciaNotificacaoSalvar,
  TamanhoFonte,
  TemaPreferido,
  TrocarSenha,
  UsuarioLogado,
  UsuarioSelfUpdate,
} from "@planogestao/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../services/api";
import { useAparencia } from "../store/aparenciaStore";
import { useAuthStore } from "../store/authStore";

/** Nome/foto aparecem em listas (ranking, membros...): recarrega o que já estiver em cache. */
function useAoAtualizar() {
  const qc = useQueryClient();
  return (usuario: UsuarioLogado) => {
    useAuthStore.getState().atualizarUsuario(usuario);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "preferencias" });
  };
}

export function useAtualizarMeuPerfil() {
  const aoAtualizar = useAoAtualizar();
  return useMutation({ mutationFn: (dados: UsuarioSelfUpdate) => api.meuPerfil.atualizar(dados), onSuccess: aoAtualizar });
}

export function useEnviarFoto() {
  const aoAtualizar = useAoAtualizar();
  return useMutation({
    mutationFn: ({ arquivo, ajuste }: { arquivo: File; ajuste: AjusteFoto }) => api.meuPerfil.enviarFoto(arquivo, ajuste),
    onSuccess: aoAtualizar,
  });
}

export function useAjustarFoto() {
  const aoAtualizar = useAoAtualizar();
  return useMutation({ mutationFn: (ajuste: AjusteFoto) => api.meuPerfil.ajustarFoto(ajuste), onSuccess: aoAtualizar });
}

export function useRemoverFoto() {
  const aoAtualizar = useAoAtualizar();
  return useMutation({ mutationFn: () => api.meuPerfil.removerFoto(), onSuccess: aoAtualizar });
}

/** A nova sessão devolvida pelo backend é gravada pelo api-client (onSession). */
export function useTrocarSenha() {
  return useMutation({ mutationFn: (dados: TrocarSenha) => api.meuPerfil.trocarSenha(dados) });
}

/**
 * Tema, tamanho da fonte e cor de destaque: aplica na hora (sem esperar a rede) e salva na conta.
 * Se a API recusar, volta ao que estava salvo. Usado pela aba Aparência e pelo ícone lua/sol do topo.
 */
export function useSalvarAparencia() {
  // Aparência não muda dados das listas: só atualiza o usuário logado, sem invalidar consultas.
  return useMutation({
    mutationFn: (dados: { tema?: TemaPreferido; cor_destaque?: CorDestaque | null; tamanho_fonte?: TamanhoFonte }) =>
      api.meuPerfil.atualizar(dados),
    onMutate: (dados) => {
      const atual = useAparencia.getState();
      atual.aplicarDaConta(
        dados.tema ?? atual.preferencia,
        dados.cor_destaque !== undefined ? dados.cor_destaque : atual.cor,
        dados.tamanho_fonte ?? atual.fonte,
      );
    },
    onSuccess: (usuario) => useAuthStore.getState().atualizarUsuario(usuario),
    onError: () => {
      const u = useAuthStore.getState().usuario;
      if (u) useAparencia.getState().aplicarDaConta(u.tema, u.cor_destaque, u.tamanho_fonte);
    },
  });
}

const CHAVE_PREFERENCIAS_NOTIFICACAO = ["meu-perfil", "preferencias-notificacao"] as const;

/** Canais (sistema/e-mail) de cada aviso operacional, do próprio usuário. */
export function usePreferenciasNotificacao() {
  return useQuery({ queryKey: CHAVE_PREFERENCIAS_NOTIFICACAO, queryFn: () => api.meuPerfil.preferenciasNotificacao() });
}

export function useSalvarPreferenciasNotificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itens: PreferenciaNotificacaoSalvar[]) => api.meuPerfil.salvarPreferenciasNotificacao(itens),
    onSuccess: (lista) => qc.setQueryData(CHAVE_PREFERENCIAS_NOTIFICACAO, lista),
  });
}
