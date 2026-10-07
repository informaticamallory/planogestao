import { useState } from "react";
import { Image, Text, View } from "react-native";

import { API_BASE_URL } from "../config/api";
import { cores, escalarTexto, estilosDinamicos } from "../theme";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1]![0] : "")).toUpperCase();
}

interface Ajuste {
  circular: boolean;
  inteira: boolean;
  x: number;
  y: number;
  zoom: number;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Enquadramento no fragmento da URL (mesmo formato do web e do backend: #f=c&m=p&x=…&y=…&z=…). */
function lerUrl(url: string): { src: string; ajuste: Ajuste } {
  const [src = url, frag = ""] = url.split("#", 2);
  const p = new Map(frag.split("&").map((par) => par.split("=") as [string, string]));
  const num = (k: string, padrao: number) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : padrao);
  return {
    src,
    ajuste: {
      circular: p.get("f") === "c",
      inteira: p.get("m") === "i",
      x: limitar(num("x", 0.5), 0, 1),
      y: limitar(num("y", 0.5), 0, 1),
      zoom: limitar(num("z", 1), 1, 3),
    },
  };
}

/**
 * Caixa da imagem dentro da moldura (lado L): a mesma geometria do web (object-fit cover + object-position x/y +
 * zoom com origem no mesmo ponto). "inteira": a foto toda, centralizada, sem cortes.
 */
function caixa(a: Ajuste, proporcao: number, lado: number) {
  if (a.inteira) {
    const largura = proporcao >= 1 ? lado : lado * proporcao;
    const altura = proporcao >= 1 ? lado / proporcao : lado;
    return { width: largura, height: altura, left: (lado - largura) / 2, top: (lado - altura) / 2 };
  }
  const largura = (proporcao >= 1 ? proporcao : 1) * a.zoom * lado;
  const altura = (proporcao >= 1 ? 1 : 1 / proporcao) * a.zoom * lado;
  return { width: largura, height: altura, left: -(largura - lado) * a.x, top: -(altura - lado) * a.y };
}

/** Foto do usuário (a mesma do web, com o enquadramento escolhido em Meu Perfil); sem foto ou se falhar, as iniciais. */
export function Avatar({ nome, url, tamanho = 48 }: { nome: string; url?: string | null; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const [proporcao, setProporcao] = useState<number | null>(null);
  const lado = escalarTexto(tamanho);
  const foto = url ? lerUrl(url) : null;
  const moldura = { width: lado, height: lado, borderRadius: foto?.ajuste.circular ? lado / 2 : Math.round(lado * 0.27) };
  // "/usuarios/fotos/…" é servido pela API; endereços http(s) vêm como estão (sem o fragmento do enquadramento).
  const uri = foto && (foto.src.startsWith("/") ? `${API_BASE_URL.replace(/\/$/, "")}${foto.src}` : foto.src);

  if (uri && foto && !falhou) {
    return (
      <View style={[estilos.base, moldura, foto.ajuste.inteira && estilos.neutro]} accessible={false}>
        <Image
          source={{ uri }}
          // Até saber a proporção, fica invisível (evita um quadro com o enquadramento errado).
          style={[estilos.imagem, caixa(foto.ajuste, proporcao ?? 1, lado), proporcao === null && estilos.oculta]}
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            setProporcao(width && height ? width / height : 1);
          }}
          onError={() => setFalhou(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
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
  neutro: { backgroundColor: cores.fundo2 },
  imagem: { position: "absolute" },
  oculta: { opacity: 0 },
  iniciais: { color: cores.primariaSuaveTexto, fontWeight: "700" },
}));
