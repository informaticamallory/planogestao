import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { Icone, type NomeIcone } from "../../components/Icone";
import { useContagemNotificacoes } from "../../hooks/useNotificacoes";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { cores, escalarTexto, fonte } from "../../theme";

const icone =
  (nome: NomeIcone) =>
  ({ color }: { color: ColorValue }) => <Icone nome={nome} tamanho={23} cor={color} />;

export default function AbasLayout() {
  const usuario = useAuthStore((s) => s.usuario);
  // Aba sem permissão: some da barra (href: null). A API também recusa o acesso.
  const se = (permissao: string) => (temPermissao(usuario, permissao) ? {} : { href: null });
  const contagem = useContagemNotificacoes(temPermissao(usuario, "notificacoes:ver"));
  const naoLidas = contagem.data?.nao_lidas ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.primaria,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarStyle: { backgroundColor: cores.superficie, borderTopColor: cores.borda },
        tabBarLabelStyle: { fontSize: fonte.xs, fontWeight: "600" },
        headerStyle: { backgroundColor: cores.superficie },
        headerTitleStyle: { fontWeight: "700", color: cores.texto },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: icone("home"), ...se("dashboard:ver") }} />
      <Tabs.Screen name="minhas-acoes" options={{ title: "Minhas Ações", tabBarIcon: icone("userCheck"), ...se("acoes:ver_proprias") }} />
      <Tabs.Screen name="calendario" options={{ title: "Calendário", tabBarIcon: icone("calendar"), ...se("calendario:ver") }} />
      <Tabs.Screen name="notificacoes" options={{
          title: "Notificações",
          tabBarIcon: icone("bell"),
          tabBarBadge: naoLidas > 0 ? (naoLidas > 99 ? "99+" : naoLidas) : undefined,
          tabBarBadgeStyle: { backgroundColor: cores.primaria, fontSize: escalarTexto(10), fontWeight: "700" },
          ...se("notificacoes:ver"),
        }} />
      {/* "Mais" tem Stack próprio (menu → módulo), com cabeçalho dele. */}
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icone("menu"), headerShown: false }} />
    </Tabs>
  );
}
