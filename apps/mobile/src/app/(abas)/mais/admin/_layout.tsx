import { Redirect, Stack } from "expo-router";

import { temPermissao, useAuthStore } from "../../../../store/authStore";
import { cores } from "../../../../theme";

/**
 * Administração: exclusiva do perfil Administrador (Fase 13). As permissões admin:* só existem nesse
 * perfil; esconder aqui é conveniência — quem garante é a API, que responde 403 aos demais.
 */
export default function AdminLayout() {
  const usuario = useAuthStore((s) => s.usuario);
  if (!temPermissao(usuario, "admin:usuarios")) return <Redirect href="/mais" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: cores.superficie },
        headerTitleStyle: { fontWeight: "700", color: cores.texto },
        headerTintColor: cores.primaria,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Administração" }} />
      <Stack.Screen name="usuarios/index" options={{ title: "Usuários" }} />
      <Stack.Screen name="usuarios/[id]" options={{ title: "Usuário" }} />
      <Stack.Screen name="perfis/index" options={{ title: "Perfis" }} />
      <Stack.Screen name="perfis/[id]" options={{ title: "Perfil" }} />
      <Stack.Screen name="cadastros/[tipo]/index" options={{ title: "" }} />
      <Stack.Screen name="cadastros/[tipo]/[id]" options={{ title: "" }} />
      <Stack.Screen name="configuracoes" options={{ title: "Configurações" }} />
    </Stack>
  );
}
