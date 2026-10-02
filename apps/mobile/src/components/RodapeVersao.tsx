import { Text } from "react-native";

import { API_BASE_URL, VARIANTE_APP, VERSAO_APP } from "../config/api";
import { cores, estilosDinamicos, fonte } from "../theme";

const AMBIENTE: Record<string, string> = { development: "Desenvolvimento", preview: "Homologação", production: "Produção" };

/** "v1.0.0 · Homologação · api-homolog.exemplo.com" — para conferir num build instalado para onde ele aponta. */
export function RodapeVersao() {
  let servidor = API_BASE_URL;
  try {
    servidor = new URL(API_BASE_URL).host;
  } catch {
    // mantém a URL como veio
  }
  const partes = [`v${VERSAO_APP}`, VARIANTE_APP === "production" ? null : (AMBIENTE[VARIANTE_APP] ?? VARIANTE_APP), servidor].filter(Boolean);
  return (
    <Text style={estilos.texto} accessibilityLabel={`Versão ${VERSAO_APP}, ambiente ${AMBIENTE[VARIANTE_APP] ?? VARIANTE_APP}, servidor ${servidor}`}>
      {partes.join(" · ")}
    </Text>
  );
}

const estilos = estilosDinamicos(() => ({
  texto: { fontSize: fonte.xs, color: cores.textoSutil, textAlign: "center" },
}));
