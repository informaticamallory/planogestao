import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icone } from "../components/Icone";
import { useLogout } from "../hooks/useAuth";
import { useRede } from "../hooks/useRede";
import { useAuthStore } from "../store/authStore";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../theme";

/** Há sessão salva no aparelho, mas não deu para confirmá-la no servidor. Nada de tela em branco nem erro cru. */
export default function SemConexaoScreen() {
  const { offline } = useRede();
  const voltarAVerificar = useAuthStore((s) => s.voltarAVerificar);
  const logout = useLogout();

  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.cartao}>
        <View style={estilos.icone}>
          <Icone nome="wifiOff" tamanho={28} cor={cores.aviso} />
        </View>
        <Text style={estilos.titulo}>{offline ? "Você está sem conexão" : "Servidor indisponível"}</Text>
        <Text style={estilos.texto}>
          {offline
            ? "Conecte-se à internet (Wi-Fi ou dados móveis) para carregar seus planos e ações."
            : "Não conseguimos falar com o servidor agora. Tente novamente em instantes."}
        </Text>
        <Pressable style={estilos.botao} onPress={voltarAVerificar} accessibilityRole="button">
          <Icone nome="refresh" tamanho={18} cor={cores.primariaTexto} />
          <Text style={estilos.textoBotao}>Tentar novamente</Text>
        </Pressable>
        <Pressable onPress={() => logout.mutate()} accessibilityRole="button" hitSlop={8}>
          <Text style={estilos.link}>Sair desta conta</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, justifyContent: "center", padding: espaco[5], backgroundColor: cores.fundo },
  cartao: {
    alignItems: "center",
    gap: espaco[3],
    padding: espaco[6],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.xl,
    backgroundColor: cores.superficie,
  },
  icone: { width: 56, height: 56, borderRadius: raio.md, alignItems: "center", justifyContent: "center", backgroundColor: cores.avisoSuave },
  titulo: { fontSize: fonte.lg, fontWeight: "700", color: cores.texto, textAlign: "center" },
  texto: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", lineHeight: escalarTexto(20) },
  botao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[2],
    marginTop: espaco[2],
    paddingHorizontal: espaco[5],
    minHeight: 46,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
  },
  textoBotao: { color: cores.primariaTexto, fontWeight: "700", fontSize: fonte.md },
  link: { color: cores.textoSuave, fontSize: fonte.sm, fontWeight: "600", textDecorationLine: "underline" },
}));
