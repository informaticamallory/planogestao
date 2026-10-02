import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icone } from "../components/Icone";
import { RodapeVersao } from "../components/RodapeVersao";
import { mensagemDeErro, useLogin } from "../hooks/useAuth";
import { useRede } from "../hooks/useRede";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const campoSenha = useRef<TextInput>(null);
  const login = useLogin();
  const { offline } = useRede();

  const podeEnviar = !!email.trim() && !!senha && !login.isPending;
  // Ao logar, onSession atualiza o authStore e o guarda de rota leva para as abas.
  const enviar = () => podeEnviar && login.mutate({ email: email.trim(), senha });

  return (
    <SafeAreaView style={estilos.tela} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <View style={estilos.logomarca}>
              <Text style={estilos.letra}>P</Text>
            </View>
            <View>
              <Text style={estilos.nome}>PlanoGestão</Text>
              <Text style={estilos.sub}>Mallory · Gestão de Planos de Ação</Text>
            </View>
          </View>

          <View style={estilos.cartao}>
            <Text style={estilos.instrucao}>Acesse com seu e-mail corporativo.</Text>

            {offline && (
              <View style={[estilos.aviso, estilos.avisoOffline]} accessibilityRole="alert">
                <Icone nome="wifiOff" tamanho={18} cor={cores.aviso} />
                <Text style={[estilos.textoAviso, { color: cores.aviso }]}>Sem conexão. Conecte-se à internet para entrar.</Text>
              </View>
            )}
            {login.isError && (
              <View style={[estilos.aviso, estilos.avisoErro]} accessibilityRole="alert">
                <Icone nome="alert" tamanho={18} cor={cores.perigo} />
                <Text style={[estilos.textoAviso, { color: cores.perigo }]}>{mensagemDeErro(login.error)}</Text>
              </View>
            )}

            <View style={estilos.campo}>
              <Text style={estilos.rotulo} nativeID="rotulo-email">
                E-MAIL
              </Text>
              <TextInput
                style={estilos.entrada}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => campoSenha.current?.focus()}
                accessibilityLabelledBy="rotulo-email"
                accessibilityLabel="E-mail"
                placeholder="nome@empresa.com.br"
                placeholderTextColor={cores.textoSutil}
              />
            </View>

            <View style={estilos.campo}>
              <Text style={estilos.rotulo} nativeID="rotulo-senha">
                SENHA
              </Text>
              <View>
                <TextInput
                  ref={campoSenha}
                  style={[estilos.entrada, { paddingRight: 84 }]}
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry={!mostrarSenha}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={enviar}
                  accessibilityLabelledBy="rotulo-senha"
                  accessibilityLabel="Senha"
                />
                <Pressable
                  style={estilos.mostrar}
                  onPress={() => setMostrarSenha((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  hitSlop={8}
                >
                  <Text style={estilos.textoMostrar}>{mostrarSenha ? "Ocultar" : "Mostrar"}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [estilos.botao, !podeEnviar && estilos.botaoDesabilitado, pressed && podeEnviar && { opacity: 0.9 }]}
              onPress={enviar}
              disabled={!podeEnviar}
              accessibilityRole="button"
              accessibilityState={{ disabled: !podeEnviar, busy: login.isPending }}
            >
              {login.isPending ? <ActivityIndicator color={cores.primariaTexto} /> : <Text style={estilos.textoBotao}>Entrar</Text>}
            </Pressable>
          </View>
          <RodapeVersao />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: "center", padding: espaco[5], gap: espaco[5] },
  marca: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  logomarca: { width: 46, height: 46, borderRadius: raio.md, backgroundColor: cores.primaria, alignItems: "center", justifyContent: "center" },
  letra: { color: cores.primariaTexto, fontSize: fonte.xl, fontWeight: "800" },
  nome: { fontSize: fonte.xl, fontWeight: "700", color: cores.texto },
  sub: { fontSize: fonte.sm, color: cores.textoSuave },
  cartao: {
    gap: espaco[4],
    padding: espaco[5],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.xl,
    backgroundColor: cores.superficie,
  },
  instrucao: { fontSize: fonte.base, color: cores.textoSuave },
  aviso: { flexDirection: "row", alignItems: "flex-start", gap: espaco[2], padding: espaco[3], borderRadius: raio.md },
  avisoOffline: { backgroundColor: cores.avisoSuave },
  avisoErro: { backgroundColor: cores.perigoSuave },
  textoAviso: { flex: 1, fontSize: fonte.sm, lineHeight: escalarTexto(18), fontWeight: "600" },
  campo: { gap: 6 },
  rotulo: { fontSize: escalarTexto(10), fontWeight: "700", letterSpacing: 0.6, color: cores.textoSutil },
  entrada: {
    minHeight: 46,
    paddingHorizontal: espaco[3],
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    color: cores.texto,
    fontSize: fonte.md,
  },
  mostrar: { position: "absolute", right: espaco[3], top: 0, bottom: 0, justifyContent: "center" },
  textoMostrar: { color: cores.primariaSuaveTexto, fontWeight: "600", fontSize: fonte.sm },
  botao: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
  },
  botaoDesabilitado: { opacity: 0.45 },
  textoBotao: { color: cores.primariaTexto, fontSize: fonte.md, fontWeight: "700" },
}));
