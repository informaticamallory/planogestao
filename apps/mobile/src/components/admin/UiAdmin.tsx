import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { Botao } from "../Botao";
import { Icone } from "../Icone";
import { Pilula } from "../Pilula";

/** Linha tocável de uma listagem administrativa. */
export function ItemAdmin({
  titulo,
  subtitulo,
  detalhe,
  ativo,
  selo,
  onPress,
}: {
  titulo: string;
  subtitulo?: string;
  detalhe?: string;
  ativo?: boolean;
  selo?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}${subtitulo ? `, ${subtitulo}` : ""}${ativo === false ? ", inativo" : ""}`}
      accessibilityHint="Abre para editar"
      style={({ pressed }) => [estilos.item, ativo === false && { opacity: 0.6 }, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={estilos.linhaTitulo}>
          <Text style={estilos.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {selo && <Pilula texto={selo} cor={cores.info} />}
        </View>
        {subtitulo && (
          <Text style={estilos.subtitulo} numberOfLines={1}>
            {subtitulo}
          </Text>
        )}
        {detalhe && <Text style={estilos.detalhe}>{detalhe}</Text>}
      </View>
      {ativo !== undefined && <Pilula texto={ativo ? "Ativo" : "Inativo"} cor={ativo ? cores.sucesso : cores.textoSuave} />}
      <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
    </Pressable>
  );
}

export function Interruptor({ rotulo, ajuda, valor, onAlterar, desabilitado }: { rotulo: string; ajuda?: string; valor: boolean; onAlterar: (v: boolean) => void; desabilitado?: boolean }) {
  return (
    <Pressable
      onPress={() => !desabilitado && onAlterar(!valor)}
      accessibilityRole="switch"
      accessibilityState={{ checked: valor, disabled: desabilitado }}
      accessibilityLabel={rotulo}
      style={[estilos.interruptor, desabilitado && { opacity: 0.55 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.rotuloInterruptor}>{rotulo}</Text>
        {ajuda && <Text style={estilos.detalhe}>{ajuda}</Text>}
      </View>
      <Switch
        value={valor}
        onValueChange={onAlterar}
        disabled={desabilitado}
        trackColor={{ true: cores.primaria, false: cores.borda }}
        thumbColor={cores.superficie}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export function Aviso({ tipo, texto }: { tipo: "erro" | "sucesso" | "info"; texto: string }) {
  const cor = tipo === "erro" ? cores.perigo : tipo === "sucesso" ? cores.sucesso : cores.info;
  const fundo = tipo === "erro" ? cores.perigoSuave : tipo === "sucesso" ? cores.sucessoSuave : cores.infoSuave;
  return (
    <View style={[estilos.aviso, { backgroundColor: fundo }]} accessibilityRole={tipo === "erro" ? "alert" : "text"} accessibilityLiveRegion="polite">
      <Icone nome={tipo === "sucesso" ? "checkCircle" : "alert"} tamanho={18} cor={cor} />
      <Text style={[estilos.textoAviso, { color: tipo === "info" ? cores.texto : cor }]}>{texto}</Text>
    </View>
  );
}

/** Formulário em tela cheia: conteúdo rolável e a barra de salvar fixa acima do teclado. */
export function TelaFormulario({ children, rodape }: { children: ReactNode; rodape: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: cores.fundo }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <ScrollView contentContainerStyle={estilos.form} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[estilos.rodape, { paddingBottom: Math.max(insets.bottom, espaco[3]) }]}>{rodape}</View>
    </KeyboardAvoidingView>
  );
}

export function BotaoNovo({ texto, onPress }: { texto: string; onPress: () => void }) {
  return <Botao texto={texto} variante="primaria" icone="userCheck" onPress={onPress} compacto />;
}

export const estilosAdmin = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], gap: espaco[3], paddingBottom: espaco[8] },
  cabecalho: { gap: espaco[3], marginBottom: espaco[3] },
  texto: { fontSize: fonte.sm, color: cores.textoSuave, lineHeight: escalarTexto(18) },
  vazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", paddingVertical: espaco[8] },
}));

const estilos = estilosDinamicos(() => ({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    minHeight: 64,
    padding: espaco[3],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    backgroundColor: cores.superficie,
  },
  linhaTitulo: { flexDirection: "row", alignItems: "center", gap: espaco[2] },
  titulo: { flexShrink: 1, fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  subtitulo: { fontSize: fonte.sm, color: cores.textoSuave },
  detalhe: { fontSize: fonte.xs, color: cores.textoSutil },
  interruptor: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    minHeight: 56,
    paddingHorizontal: espaco[3],
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
  },
  rotuloInterruptor: { fontSize: fonte.base, fontWeight: "600", color: cores.texto },
  aviso: { flexDirection: "row", alignItems: "center", gap: espaco[3], padding: espaco[3], borderRadius: raio.md },
  textoAviso: { flex: 1, fontSize: fonte.sm, fontWeight: "600", lineHeight: escalarTexto(18) },
  form: { padding: espaco[4], gap: espaco[4], paddingBottom: espaco[8] },
  rodape: { flexDirection: "row", gap: espaco[3], paddingHorizontal: espaco[4], paddingTop: espaco[3], backgroundColor: cores.superficie, borderTopWidth: 1, borderTopColor: cores.borda },
}));
