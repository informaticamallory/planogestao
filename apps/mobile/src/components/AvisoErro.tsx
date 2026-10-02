import { Pressable, Text, View } from "react-native";

import { mensagemDeErro } from "../hooks/useAuth";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { Icone } from "./Icone";

/** Erro de carregamento com mensagem clara (nunca o erro cru) e ação de tentar de novo. */
export function AvisoErro({ erro, onTentar, titulo = "Não foi possível carregar" }: { erro: unknown; onTentar?: () => void; titulo?: string }) {
  return (
    <View style={estilos.caixa} accessibilityRole="alert">
      <Icone nome="alert" tamanho={20} cor={cores.perigo} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.texto}>{mensagemDeErro(erro)}</Text>
      </View>
      {onTentar && (
        <Pressable onPress={onTentar} accessibilityRole="button" hitSlop={8}>
          <Text style={estilos.link}>Tentar de novo</Text>
        </Pressable>
      )}
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  caixa: { flexDirection: "row", alignItems: "center", gap: espaco[3], padding: espaco[3], borderRadius: raio.md, backgroundColor: cores.perigoSuave },
  titulo: { fontSize: fonte.sm, fontWeight: "700", color: cores.perigo },
  texto: { fontSize: fonte.xs, color: cores.texto, lineHeight: escalarTexto(16) },
  link: { fontSize: fonte.sm, fontWeight: "700", color: cores.perigo },
}));
