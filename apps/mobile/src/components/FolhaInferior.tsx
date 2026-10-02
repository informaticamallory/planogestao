import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../theme";

/** Bottom sheet simples (Modal nativo): toque fora ou botão voltar fecham. */
export function FolhaInferior({
  visivel,
  titulo,
  onFechar,
  children,
}: {
  visivel: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={estilos.raiz} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={estilos.fundo} onPress={onFechar} accessibilityLabel="Fechar" accessibilityRole="button" />
        <View style={[estilos.folha, { paddingBottom: Math.max(insets.bottom, espaco[4]) }]} accessibilityViewIsModal>
          <View style={estilos.alca} />
          <Text style={estilos.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.corpo}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = estilosDinamicos(() => ({
  raiz: { flex: 1, justifyContent: "flex-end" },
  fundo: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(16,25,33,0.45)" },
  folha: {
    maxHeight: "88%",
    backgroundColor: cores.superficie,
    borderTopLeftRadius: raio.xl,
    borderTopRightRadius: raio.xl,
    paddingHorizontal: espaco[4],
    paddingTop: espaco[2],
  },
  alca: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: cores.borda, marginBottom: espaco[3] },
  titulo: { fontSize: fonte.lg, fontWeight: "700", color: cores.texto, marginBottom: espaco[3] },
  corpo: { gap: espaco[4], paddingBottom: espaco[2] },
}));
