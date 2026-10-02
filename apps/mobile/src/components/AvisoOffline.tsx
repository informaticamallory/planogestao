import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRede } from "../hooks/useRede";
import { cores, espaco, estilosDinamicos, fonte } from "../theme";
import { Icone } from "./Icone";

/** Faixa fixa no topo quando o aparelho está sem rede. Some sozinha quando a conexão volta. */
export function AvisoOffline() {
  const { offline } = useRede();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View style={[estilos.faixa, { paddingTop: insets.top + espaco[2] }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icone nome="wifiOff" tamanho={18} cor={cores.primariaTexto} />
      <Text style={estilos.texto}>Sem conexão com a internet. Os dados podem estar desatualizados.</Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  faixa: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[2],
    paddingHorizontal: espaco[4],
    paddingBottom: espaco[2],
    backgroundColor: cores.tinta,
  },
  texto: { flex: 1, color: cores.primariaTexto, fontSize: fonte.sm, fontWeight: "600" },
}));
