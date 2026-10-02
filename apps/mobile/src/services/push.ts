/**
 * Push (expo-notifications): permissão, token do Expo e rota a abrir no toque.
 *
 * Limitações conhecidas (documentação do Expo SDK 57):
 * - Expo Go no Android não recebe push remoto desde o SDK 53 → precisa de development build.
 * - O token do Expo exige o projectId do EAS (app.json → extra.eas.projectId).
 * Sem essas condições, o registro é pulado sem erro (a aba Notificações continua funcionando).
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { api } from "./api";

const CHAVE_TOKEN = "planogestao.push_token";
const CHAVE_PERGUNTOU = "planogestao.push_permissao_pedida";
export const CANAL_PADRAO = "default";

/** Com o app aberto, o push também aparece como banner (e entra na lista da central). */
export function configurarExibicao() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export type ResultadoRegistro =
  | { status: "registrado"; token: string }
  | { status: "sem_permissao" }
  | { status: "indisponivel"; motivo: string };

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function motivoIndisponivel(): string | null {
  if (Platform.OS === "web") return "web";
  if (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return "Expo Go no Android não recebe push remoto (use um development build).";
  if (!Device.isDevice && Platform.OS === "ios") return "Simulador iOS sem suporte a push remoto.";
  if (!projectId()) return "Projeto sem extra.eas.projectId (rode `eas init`).";
  return null;
}

/**
 * Chamado ao entrar na área logada. Pede a permissão uma única vez (no primeiro login); se o
 * usuário negar, não insiste — dá para ligar depois nas configurações do sistema.
 */
export async function registrarPush(): Promise<ResultadoRegistro> {
  const motivo = motivoIndisponivel();
  if (motivo) return { status: "indisponivel", motivo };

  if (Platform.OS === "android") {
    // Android 8+: sem canal, a notificação não aparece. O backend envia channelId "default".
    await Notifications.setNotificationChannelAsync(CANAL_PADRAO, {
      name: "Avisos do PlanoGestão",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ff6600",
    });
  }

  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const jaPerguntou = (await SecureStore.getItemAsync(CHAVE_PERGUNTOU)) === "1";
    if (jaPerguntou || !canAskAgain) return { status: "sem_permissao" };
    await SecureStore.setItemAsync(CHAVE_PERGUNTOU, "1");
    ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return { status: "sem_permissao" };
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await api.dispositivos.registrarToken({ token, plataforma: Platform.OS === "ios" ? "ios" : "android" });
  await SecureStore.setItemAsync(CHAVE_TOKEN, token);
  return { status: "registrado", token };
}

/** No logout (antes de invalidar a sessão): o aparelho para de receber push deste usuário. */
export async function removerPush(): Promise<void> {
  const token = await SecureStore.getItemAsync(CHAVE_TOKEN);
  if (!token) return;
  try {
    await api.dispositivos.removerToken(token);
  } finally {
    await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  }
}

export interface DadosPush {
  notificacao_id?: number;
  url?: string | null;
}

const ROTAS_PERMITIDAS = [/^\/acoes\/\d+$/, /^\/planos\/\d+$/];

/** Só navega para rotas conhecidas do app — nunca para um endereço arbitrário vindo no push. */
export function rotaDoPush(dados: unknown): string | null {
  const url = (dados as DadosPush | undefined)?.url;
  return typeof url === "string" && ROTAS_PERMITIDAS.some((r) => r.test(url)) ? url : null;
}
