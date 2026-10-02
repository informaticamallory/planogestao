import { ScrollView, Text, View } from "react-native";

import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { Icone, type NomeIcone } from "./Icone";

/** Estrutura das telas que serão construídas nas próximas fases (sem dados inventados). */
export function TelaEmBreve({ titulo, descricao, icone }: { titulo: string; descricao: string; icone: NomeIcone }) {
  return (
    <ScrollView contentContainerStyle={estilos.conteudo} style={estilos.tela}>
      <View style={estilos.cartao}>
        <View style={estilos.icone}>
          <Icone nome={icone} tamanho={26} cor={cores.primariaSuaveTexto} />
        </View>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.descricao}>{descricao}</Text>
        <Text style={estilos.selo}>Em construção</Text>
      </View>
    </ScrollView>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4] },
  cartao: {
    alignItems: "center",
    gap: espaco[2],
    padding: espaco[6],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.xl,
    backgroundColor: cores.superficie,
  },
  icone: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: raio.md,
    backgroundColor: cores.primariaSuave,
  },
  titulo: { fontSize: fonte.lg, fontWeight: "700", color: cores.texto, textAlign: "center" },
  descricao: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", lineHeight: escalarTexto(20) },
  selo: {
    marginTop: espaco[2],
    paddingHorizontal: espaco[3],
    paddingVertical: espaco[1],
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: cores.fundo2,
    color: cores.textoSuave,
    fontSize: fonte.xs,
    fontWeight: "600",
  },
}));
