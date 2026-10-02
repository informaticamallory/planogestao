import { Link } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { Icone } from "../../../components/Icone";
import { RodapeVersao } from "../../../components/RodapeVersao";
import { useLogout } from "../../../hooks/useAuth";
import { MODULOS_MAIS } from "../../../navigation/modulos";
import { temPermissao, useAuthStore } from "../../../store/authStore";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../theme";

// Módulos já implementados no app; os demais abrem o marcador "em breve".
const ROTAS_PRONTAS: Record<string, "/mais/planos" | "/mais/indicadores" | "/mais/relatorios" | "/mais/admin"> = {
  planos: "/mais/planos",
  indicadores: "/mais/indicadores",
  relatorios: "/mais/relatorios",
  administracao: "/mais/admin",
};

export default function MaisScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useLogout();
  const visiveis = MODULOS_MAIS.filter((m) => temPermissao(usuario, m.permissao));

  const confirmarSaida = () =>
    Alert.alert("Sair", "Encerrar a sessão neste aparelho?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => logout.mutate() },
    ]);

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.usuario}>
        <Avatar nome={usuario?.nome ?? ""} url={usuario?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.nome}>{usuario?.nome}</Text>
          <Text style={estilos.meta}>
            {usuario?.perfil.nome} · {usuario?.email}
          </Text>
        </View>
      </View>

      <View style={estilos.grupo}>
        {visiveis.map((m, i) => (
          <Link key={m.id} href={ROTAS_PRONTAS[m.id] ?? { pathname: "/mais/[modulo]", params: { modulo: m.id } }} asChild>
            <Pressable style={({ pressed }) => [estilos.item, i > 0 && estilos.divisor, pressed && estilos.pressionado]} accessibilityRole="link">
              <View style={estilos.iconeItem}>
                <Icone nome={m.icone} tamanho={20} cor={cores.primariaSuaveTexto} />
              </View>
              <Text style={estilos.tituloItem}>{m.titulo}</Text>
              <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={estilos.grupo}>
        <Pressable
          style={({ pressed }) => [estilos.item, pressed && estilos.pressionado]}
          onPress={confirmarSaida}
          disabled={logout.isPending}
          accessibilityRole="button"
        >
          <View style={[estilos.iconeItem, { backgroundColor: cores.perigoSuave }]}>
            <Icone nome="logOut" tamanho={20} cor={cores.perigo} />
          </View>
          <Text style={[estilos.tituloItem, { color: cores.perigo }]}>Sair</Text>
          {logout.isPending && <ActivityIndicator color={cores.perigo} />}
        </Pressable>
      </View>
      <RodapeVersao />
    </ScrollView>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], gap: espaco[4] },
  usuario: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  nome: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  meta: { fontSize: fonte.sm, color: cores.textoSuave },
  grupo: { borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: espaco[3], minHeight: 56, paddingHorizontal: espaco[4] },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  pressionado: { backgroundColor: cores.fundo2 },
  iconeItem: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: cores.primariaSuave },
  tituloItem: { flex: 1, fontSize: fonte.base, fontWeight: "600", color: cores.texto },
}));
