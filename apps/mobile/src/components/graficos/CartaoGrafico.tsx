import { type ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { AvisoErro } from "../AvisoErro";

/** Cartão de gráfico com alternância Gráfico | Lista (alternativa legível em tela pequena). */
export function CartaoGrafico({
  titulo,
  carregando,
  erro,
  onTentar,
  vazio,
  mensagemVazio = "Sem dados para os filtros escolhidos.",
  grafico,
  lista,
  atualizando,
}: {
  titulo: string;
  carregando: boolean;
  erro: unknown;
  onTentar?: () => void;
  vazio?: boolean;
  mensagemVazio?: string;
  grafico: () => ReactNode;
  lista: () => ReactNode;
  atualizando?: boolean;
}) {
  const [comoLista, setComoLista] = useState(false);
  const temDados = !carregando && !erro && !vazio;

  return (
    <View style={estilos.cartao}>
      <View style={estilos.topo}>
        <Text style={estilos.titulo} accessibilityRole="header" numberOfLines={2}>
          {titulo}
        </Text>
        {temDados && (
          <View style={estilos.alternador} accessibilityRole="tablist">
            {[
              { v: false, t: "Gráfico" },
              { v: true, t: "Lista" },
            ].map((o) => (
              <Pressable
                key={o.t}
                onPress={() => setComoLista(o.v)}
                accessibilityRole="tab"
                accessibilityState={{ selected: comoLista === o.v }}
                accessibilityLabel={`${titulo}: ver como ${o.t.toLowerCase()}`}
                hitSlop={6}
                style={[estilos.opcao, comoLista === o.v && estilos.opcaoAtiva]}
              >
                <Text style={[estilos.textoOpcao, comoLista === o.v && { color: cores.texto }]}>{o.t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <View style={atualizando ? { opacity: 0.55 } : undefined}>
        {carregando ? (
          <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
        ) : erro ? (
          <AvisoErro erro={erro} onTentar={onTentar} />
        ) : vazio ? (
          <Text style={estilos.vazio}>{mensagemVazio}</Text>
        ) : comoLista ? (
          lista()
        ) : (
          grafico()
        )}
      </View>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  cartao: { gap: espaco[4], padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[3] },
  titulo: { flex: 1, fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  alternador: { flexDirection: "row", padding: 2, borderRadius: raio.sm, backgroundColor: cores.fundo2 },
  opcao: { minHeight: 32, paddingHorizontal: 10, justifyContent: "center", borderRadius: 6 },
  opcaoAtiva: { backgroundColor: cores.superficie },
  textoOpcao: { fontSize: fonte.sm, fontWeight: "700", color: cores.textoSuave },
  vazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", paddingVertical: espaco[6] },
}));
