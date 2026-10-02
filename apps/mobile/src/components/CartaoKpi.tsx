import { Pressable, Text, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { Icone } from "./Icone";

interface CartaoKpiProps {
  rotulo: string;
  valor: string;
  /** Linha de apoio (ex.: "Ações concluídas até o prazo"). */
  dica?: string;
  /** Cor de destaque da categoria (faixa inferior + ponto). */
  cor: string;
  /** Com onPress, o cartão é tocável e mostra o chevron. */
  onPress?: () => void;
  carregando?: boolean;
}

export function CartaoKpi({ rotulo, valor, dica, cor, onPress, carregando }: CartaoKpiProps) {
  const conteudo = (
    <>
      <View style={estilos.topo}>
        <Text style={[estilos.valor, carregando && { color: cores.textoSutil }]} numberOfLines={1}>
          {valor}
        </Text>
        {onPress && <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />}
      </View>
      <View style={estilos.rotuloLinha}>
        <View style={[estilos.ponto, { backgroundColor: cor }]} />
        <Text style={estilos.rotulo} numberOfLines={2}>
          {rotulo}
        </Text>
      </View>
      {dica && (
        <Text style={estilos.dica} numberOfLines={2}>
          {dica}
        </Text>
      )}
      <View style={[estilos.faixa, { backgroundColor: cor }]} />
    </>
  );

  if (!onPress) {
    return (
      <View style={estilos.cartao} accessible accessibilityLabel={`${rotulo}: ${valor}${dica ? `. ${dica}` : ""}`}>
        {conteudo}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilos.cartao, pressed && { backgroundColor: cores.fundo2 }]}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${valor}`}
      accessibilityHint="Abre a lista filtrada"
    >
      {conteudo}
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  cartao: {
    flex: 1,
    minHeight: 112,
    gap: 6,
    paddingHorizontal: espaco[4],
    paddingTop: espaco[3] + 2,
    paddingBottom: espaco[4],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.xl,
    backgroundColor: cores.superficie,
    overflow: "hidden",
  },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  valor: { flexShrink: 1, fontSize: fonte.titulo, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  rotuloLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  rotulo: { flex: 1, fontSize: fonte.sm, fontWeight: "700", color: cores.texto },
  dica: { fontSize: fonte.xs, color: cores.textoSutil },
  faixa: { position: "absolute", left: espaco[4], right: espaco[4], bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, opacity: 0.85 },
}));
