import { Text, View } from "react-native";

import { estilosDinamicos, fonte } from "../theme";

/** Badge em pílula: fundo claro da cor + ponto + texto (a cor nunca é a única informação). */
export function Pilula({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View style={[estilos.pilula, { backgroundColor: `${cor}1f` }]}>
      <View style={[estilos.ponto, { backgroundColor: cor }]} />
      <Text style={[estilos.texto, { color: cor }]} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  pilula: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  ponto: { width: 6, height: 6, borderRadius: 3 },
  texto: { fontSize: fonte.xs, fontWeight: "700" },
}));
