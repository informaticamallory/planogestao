import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AvisoOffline } from "../components/AvisoOffline";
import { useRestaurarSessao } from "../hooks/useAuth";
import { usePush } from "../hooks/usePush";
import { queryClient } from "../services/api";
import { configurarExibicao } from "../services/push";
import { cores } from "../theme";

// Splash fica visível até sabermos se há sessão salva (evita piscar o login para quem já está logado).
void SplashScreen.preventAutoHideAsync();
configurarExibicao();

const cabecalhoPadrao = {
  headerShown: true,
  headerTintColor: cores.primaria,
  headerTitleStyle: { fontWeight: "700" as const, color: cores.texto },
  headerStyle: { backgroundColor: cores.superficie },
  headerShadowVisible: false,
};

function Navegacao() {
  const status = useRestaurarSessao();
  usePush();

  useEffect(() => {
    if (status !== "verificando") void SplashScreen.hideAsync();
  }, [status]);

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <StatusBar style="dark" />
      <AvisoOffline />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
        {/* Stack de autenticação */}
        <Stack.Protected guard={status === "anonimo" || status === "verificando"}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        {/* Sessão salva, mas sem conseguir falar com o servidor: não desloga */}
        <Stack.Protected guard={status === "sem_conexao"}>
          <Stack.Screen name="sem-conexao" />
        </Stack.Protected>
        {/* Área logada: abas */}
        <Stack.Protected guard={status === "autenticado"}>
          <Stack.Screen name="(abas)" />
          <Stack.Screen name="acoes/[id]" options={cabecalhoPadrao} />
          <Stack.Screen name="planos/[id]" options={cabecalhoPadrao} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Navegacao />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
