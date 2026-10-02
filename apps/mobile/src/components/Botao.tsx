import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { Icone, type NomeIcone } from "./Icone";

type Variante = "primaria" | "secundaria" | "perigo" | "sucesso";

const VARIANTES: Record<Variante, { fundo: string; texto: string; borda: string }> = {
  primaria: { fundo: cores.primaria, texto: cores.primariaTexto, borda: cores.primaria },
  secundaria: { fundo: cores.superficie, texto: cores.texto, borda: cores.borda },
  perigo: { fundo: cores.superficie, texto: cores.perigo, borda: cores.perigo },
  sucesso: { fundo: cores.sucesso, texto: "#ffffff", borda: cores.sucesso },
};

/** Botão de toque grande (56 dp por padrão): pensado para uso rápido, em pé, com luva. */
export function Botao({
  texto,
  onPress,
  variante = "secundaria",
  icone,
  carregando = false,
  desabilitado = false,
  compacto = false,
  flex = false,
}: {
  texto: string;
  onPress: () => void;
  variante?: Variante;
  icone?: NomeIcone;
  carregando?: boolean;
  desabilitado?: boolean;
  compacto?: boolean;
  flex?: boolean;
}) {
  const v = VARIANTES[variante];
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      style={({ pressed }) => [
        estilos.base,
        compacto && estilos.compacto,
        flex && { flex: 1 },
        { backgroundColor: v.fundo, borderColor: v.borda },
        pressed && { opacity: 0.8 },
        inativo && { opacity: 0.55 },
      ]}
    >
      <View style={estilos.conteudo}>
        {carregando ? <ActivityIndicator color={v.texto} /> : icone && <Icone nome={icone} tamanho={compacto ? 18 : 20} cor={v.texto} />}
        <Text style={[estilos.texto, compacto && { fontSize: fonte.base }, { color: v.texto }]} numberOfLines={1}>
          {texto}
        </Text>
      </View>
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  base: { minHeight: 56, borderRadius: raio.md, borderWidth: 1.5, justifyContent: "center", paddingHorizontal: espaco[4] },
  compacto: { minHeight: 46 },
  conteudo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espaco[2] },
  texto: { fontSize: fonte.md, fontWeight: "700" },
}));
