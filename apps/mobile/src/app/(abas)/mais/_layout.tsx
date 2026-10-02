import { Stack } from "expo-router";

import { cores } from "../../../theme";

export default function MaisLayout() {
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
      <Stack.Screen name="index" options={{ title: "Mais" }} />
      <Stack.Screen name="planos" options={{ title: "Planos de Ação" }} />
      <Stack.Screen name="indicadores" options={{ title: "Indicadores" }} />
      <Stack.Screen name="relatorios" options={{ title: "Relatórios" }} />
      {/* Administração tem Stack próprio (com a trava de perfil), com cabeçalho dele. */}
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="[modulo]" options={{ title: "" }} />
    </Stack>
  );
}
