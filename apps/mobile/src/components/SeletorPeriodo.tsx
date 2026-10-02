import type { TipoPeriodo } from "@planogestao/shared-types";
import { Pressable, ScrollView, Text } from "react-native";

import { cores, espaco, estilosDinamicos, fonte } from "../theme";
import { PERIODOS_INICIO } from "../utils/rotulos";

/** Segmentado em pílula; rola na horizontal se não couber. */
export function SeletorPeriodo({ valor, onAlterar }: { valor: TipoPeriodo; onAlterar: (p: TipoPeriodo) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.trilho} accessibilityRole="radiogroup">
      {PERIODOS_INICIO.map((p) => {
        const ativo = p.id === valor;
        return (
          <Pressable
            key={p.id}
            onPress={() => onAlterar(p.id)}
            style={[estilos.opcao, ativo && estilos.opcaoAtiva]}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo }}
            hitSlop={4}
          >
            <Text style={[estilos.texto, ativo && estilos.textoAtivo]}>{p.rotulo}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const estilos = estilosDinamicos(() => ({
  trilho: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 999,
    backgroundColor: cores.fundo2,
  },
  opcao: { paddingHorizontal: espaco[3] + 2, paddingVertical: 7, borderRadius: 999 },
  opcaoAtiva: {
    backgroundColor: cores.superficie,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  texto: { fontSize: fonte.sm, fontWeight: "600", color: cores.textoSuave },
  textoAtivo: { color: cores.primaria },
}));
