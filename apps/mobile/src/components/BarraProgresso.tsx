import { Text, View } from "react-native";

import { cores, estilosDinamicos, fonte } from "../theme";

export function BarraProgresso({ valor, rotulo = "Progresso" }: { valor: number; rotulo?: string }) {
  const limitado = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <View
      style={estilos.linha}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rotulo}
      accessibilityValue={{ min: 0, max: 100, now: limitado }}
    >
      <View style={estilos.trilho}>
        <View style={[estilos.preenchimento, { width: `${limitado}%` }]} />
      </View>
      <Text style={estilos.valor}>{limitado}%</Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
  trilho: { flex: 1, height: 6, borderRadius: 3, backgroundColor: cores.fundo2, overflow: "hidden" },
  preenchimento: { height: "100%", borderRadius: 3, backgroundColor: cores.primaria },
  valor: { minWidth: 36, textAlign: "right", fontSize: fonte.xs, color: cores.textoSuave, fontVariant: ["tabular-nums"] },
}));
