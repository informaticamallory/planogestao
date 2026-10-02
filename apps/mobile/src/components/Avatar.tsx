import { useState } from "react";
import { Image, Text, View } from "react-native";

import { API_BASE_URL } from "../config/api";
import { cores, escalarTexto, estilosDinamicos } from "../theme";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1]![0] : "")).toUpperCase();
}

/** Foto do usuário (a mesma do web, enviada em Meu Perfil); sem foto ou se falhar, as iniciais. */
export function Avatar({ nome, url, tamanho = 48 }: { nome: string; url?: string | null; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const lado = escalarTexto(tamanho);
  const moldura = { width: lado, height: lado, borderRadius: Math.round(lado * 0.27) };
  // "/usuarios/fotos/…" é servido pela API; endereços http(s) vêm como estão.
  const uri = url && (url.startsWith("/") ? `${API_BASE_URL.replace(/\/$/, "")}${url}` : url);

  if (uri && !falhou) {
    return <Image source={{ uri }} style={[estilos.base, moldura]} onError={() => setFalhou(true)} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[estilos.base, estilos.fundo, moldura]} accessible={false}>
      <Text style={[estilos.iniciais, { fontSize: Math.round(lado * 0.36) }]}>{iniciais(nome)}</Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  base: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fundo: { backgroundColor: cores.primariaSuave },
  iniciais: { color: cores.primariaSuaveTexto, fontWeight: "700" },
}));
