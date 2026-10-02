import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

const PORTA_API = 8000;

/** development | preview | production (app.config.ts → extra.variante). */
export const VARIANTE_APP = (Constants.expoConfig?.extra?.variante as string | undefined) ?? "development";
export const VERSAO_APP = Constants.expoConfig?.version ?? "";

/**
 * Endereço da API.
 * 1. EXPO_PUBLIC_API_URL (embutida no bundle no build). Nos builds do EAS vem do ambiente do perfil
 *    (preview = homologação, production = produção); o app.config.ts recusa gerar esses builds sem ela.
 * 2. Só em desenvolvimento, sem a variável:
 *    - emulador Android: 10.0.2.2 é o "localhost" do computador visto de dentro do emulador;
 *    - simulador iOS: localhost do Mac;
 *    - aparelho físico (Expo Go / dev client): IP do computador que serve o bundle (hostUri do Metro),
 *      com o backend escutando na rede (`uvicorn app.main:app --host 0.0.0.0`).
 */
function resolverBaseUrl(): string {
  const definida = process.env.EXPO_PUBLIC_API_URL;
  if (definida) return definida.replace(/\/$/, "");

  if (!Device.isDevice) {
    return Platform.OS === "android" ? `http://10.0.2.2:${PORTA_API}` : `http://localhost:${PORTA_API}`;
  }

  const hostDoMetro = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${hostDoMetro ?? "localhost"}:${PORTA_API}`;
}

export const API_BASE_URL = resolverBaseUrl();
