import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { api, queryClient } from "../services/api";
import { type DadosPush, registrarPush, rotaDoPush } from "../services/push";
import { useAuthStore } from "../store/authStore";

/**
 * Montado na raiz. Com a sessão autenticada:
 * - registra o token (pede permissão no primeiro login);
 * - toque no push (app aberto, em segundo plano ou fechado) → abre a tela da entidade e marca
 *   a notificação como lida. Se o app abriu pelo push antes da sessão ser restaurada, o toque
 *   fica guardado pelo sistema e é tratado assim que a sessão ficar pronta;
 * - push recebido com o app aberto → atualiza lista e badge da aba.
 */
export function usePush() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  const tratadas = useRef(new Set<string>());

  useEffect(() => {
    if (status !== "autenticado" || usuarioId === undefined) return;
    registrarPush()
      .then((r) => __DEV__ && console.log("[push]", r.status, "motivo" in r ? r.motivo : ""))
      .catch((erro) => __DEV__ && console.warn("[push] falha ao registrar", erro));
  }, [status, usuarioId]);

  useEffect(() => {
    if (status !== "autenticado") return;

    const abrir = (resposta: Notifications.NotificationResponse) => {
      const id = resposta.notification.request.identifier;
      if (tratadas.current.has(id) || resposta.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      tratadas.current.add(id);
      Notifications.clearLastNotificationResponse();

      const dados = resposta.notification.request.content.data as DadosPush | undefined;
      if (typeof dados?.notificacao_id === "number") {
        api.notificacoes
          .marcarLida(dados.notificacao_id)
          .then(() => queryClient.invalidateQueries({ queryKey: ["notificacoes"] }))
          .catch(() => undefined);
      }
      const rota = rotaDoPush(dados);
      // Próximo ciclo: deixa o Stack.Protected trocar para a área logada antes de navegar.
      if (rota) setTimeout(() => router.push(rota as never), 0);
    };

    // App aberto a partir do push (estava fechado ou a sessão ainda não estava pronta).
    const ultima = Notifications.getLastNotificationResponse();
    if (ultima) abrir(ultima);

    const toque = Notifications.addNotificationResponseReceivedListener(abrir);
    const recebida = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    });
    return () => {
      toque.remove();
      recebida.remove();
    };
  }, [status, router]);
}
