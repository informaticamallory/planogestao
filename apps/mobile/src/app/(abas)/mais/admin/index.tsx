import { type Href, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Icone, type NomeIcone } from "../../../../components/Icone";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../../theme";

const ITENS: { titulo: string; descricao: string; icone: NomeIcone; rota: Href }[] = [
  { titulo: "Usuários", descricao: "Cadastro, perfil, área e acesso.", icone: "users", rota: "/mais/admin/usuarios" },
  { titulo: "Perfis", descricao: "Permissões por módulo e ação.", icone: "shield", rota: "/mais/admin/perfis" },
  { titulo: "Áreas", descricao: "Áreas da fábrica.", icone: "listChecks", rota: { pathname: "/mais/admin/cadastros/[tipo]", params: { tipo: "areas" } } },
  { titulo: "Funções e Cargos", descricao: "Funções e cargos de cada área.", icone: "users", rota: { pathname: "/mais/admin/cadastros/[tipo]", params: { tipo: "setores" } } },
  { titulo: "Tipos de Plano", descricao: "Classificação dos planos de ação.", icone: "fileText", rota: { pathname: "/mais/admin/cadastros/[tipo]", params: { tipo: "tipos" } } },
  { titulo: "Configurações", descricao: "Parâmetros globais do sistema.", icone: "clock", rota: "/mais/admin/configuracoes" },
];

export default function AdminMenu() {
  const router = useRouter();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: cores.fundo }} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.grupo}>
        {ITENS.map((i, n) => (
          <Pressable
            key={i.titulo}
            onPress={() => router.push(i.rota)}
            accessibilityRole="link"
            style={({ pressed }) => [estilos.item, n > 0 && estilos.divisor, pressed && { backgroundColor: cores.fundo2 }]}
          >
            <View style={estilos.icone}>
              <Icone nome={i.icone} tamanho={20} cor={cores.primariaSuaveTexto} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo}>{i.titulo}</Text>
              <Text style={estilos.descricao}>{i.descricao}</Text>
            </View>
            <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const estilos = estilosDinamicos(() => ({
  conteudo: { padding: espaco[4] },
  grupo: { borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: espaco[3], minHeight: 64, paddingHorizontal: espaco[4] },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: cores.primariaSuave },
  titulo: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  descricao: { fontSize: fonte.sm, color: cores.textoSuave },
}));
