/**
 * Configuração do app (substitui o app.json). Tudo o que muda entre ambientes vem de variáveis:
 *
 * - APP_VARIANT          development | preview | production (definida por perfil no eas.json)
 * - EXPO_PUBLIC_API_URL  URL da API. Nos builds do EAS vem do ambiente do EAS do perfil
 *                        (development / preview = homologação / production); localmente, do .env.local.
 *
 * Veja o README.md para os comandos.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import pacote from "./package.json";

type Variante = "development" | "preview" | "production";

const VARIANTE: Variante = (["development", "preview", "production"] as const).find((v) => v === process.env.APP_VARIANT) ?? "development";
const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();

// Preenchidos depois de `eas init` (o EAS não reescreve config dinâmica: ele mostra os valores para colar aqui).
const EAS_PROJECT_ID: string | undefined = undefined;
const EAS_OWNER: string | undefined = undefined;

const ID_BASE = "br.com.mallory.planogestao";

/** Cada variante tem id próprio: dev, homologação e produção instalam lado a lado no mesmo aparelho. */
const VARIANTES: Record<Variante, { nome: string; id: string; esquema: string }> = {
  development: { nome: "PlanoGestão (Dev)", id: `${ID_BASE}.dev`, esquema: "planogestao-dev" },
  preview: { nome: "PlanoGestão (Homolog)", id: `${ID_BASE}.homolog`, esquema: "planogestao-homolog" },
  production: { nome: "PlanoGestão", id: ID_BASE, esquema: "planogestao" },
};

// Build instalável sem a URL da API cairia no fallback de desenvolvimento (10.0.2.2) e não conectaria:
// melhor falhar o build já na leitura da configuração.
if (VARIANTE !== "development" && !API_URL) {
  throw new Error(
    `EXPO_PUBLIC_API_URL não definida para a variante "${VARIANTE}". ` +
      `Cadastre no ambiente do EAS: eas env:set --environment ${VARIANTE} --name EXPO_PUBLIC_API_URL --value https://... --visibility plaintext ` +
      `(ou, para build local, defina a variável no terminal).`,
  );
}
if (VARIANTE === "production" && !API_URL!.startsWith("https://")) {
  throw new Error("Em produção a API precisa ser HTTPS (lojas e sistemas bloqueiam HTTP).");
}

// Android 9+ bloqueia HTTP em builds de release. Só liberamos se a URL configurada for http:// (homologação
// na rede interna, por exemplo); com HTTPS o padrão seguro do sistema é mantido.
const PERMITIR_HTTP = !!API_URL?.startsWith("http://") || VARIANTE === "development";

// google-services.json (push no Android, ver PUSH.md): só referenciado se existir, para não quebrar o build.
const GOOGLE_SERVICES = "./google-services.json";
const temGoogleServices = existsSync(resolve(__dirname, GOOGLE_SERVICES));

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTES[VARIANTE];
  return {
    ...config,
    name: v.nome,
    slug: "planogestao",
    scheme: v.esquema,
    // Versão visível nas lojas (semver, vem do package.json). O número de build (versionCode / buildNumber)
    // é controlado pelo EAS ("appVersionSource": "remote") e incrementado a cada build de produção.
    version: pacote.version,
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ...(EAS_OWNER ? { owner: EAS_OWNER } : {}),
    ios: {
      bundleIdentifier: v.id,
      supportsTablet: true,
      config: { usesNonExemptEncryption: false }, // só HTTPS padrão: dispensa o questionário de exportação
    },
    android: {
      package: v.id,
      adaptiveIcon: {
        backgroundColor: "#ff6600",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      ...(temGoogleServices ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    },
    plugins: [
      "expo-router",
      ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 220, backgroundColor: "#101921" }],
      ["expo-secure-store", { configureAndroidBackup: true }],
      "@react-native-community/datetimepicker",
      ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#ff6600", defaultChannel: "default" }],
      "expo-sharing",
      ["expo-build-properties", { android: { usesCleartextTraffic: PERMITIR_HTTP } }],
    ],
    experiments: { typedRoutes: true },
    extra: {
      variante: VARIANTE,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};
