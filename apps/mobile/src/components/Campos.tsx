import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, TextInput, type TextInputProps, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { deIsoData, formatarData, paraIsoData } from "../utils/formatos";
import { Icone } from "./Icone";

export function Rotulo({ texto, obrigatorio }: { texto: string; obrigatorio?: boolean }) {
  return (
    <Text style={estilos.rotulo}>
      {texto}
      {obrigatorio && <Text style={{ color: cores.perigo }}> *</Text>}
    </Text>
  );
}

export function MensagemCampo({ erro, ajuda }: { erro?: string | null; ajuda?: string | null }) {
  if (erro)
    return (
      <Text style={estilos.erro} accessibilityRole="alert">
        {erro}
      </Text>
    );
  return ajuda ? <Text style={estilos.ajuda}>{ajuda}</Text> : null;
}

export function CampoTexto({
  rotulo,
  obrigatorio,
  erro,
  ajuda,
  ...props
}: TextInputProps & { rotulo: string; obrigatorio?: boolean; erro?: string | null; ajuda?: string | null }) {
  return (
    <View style={estilos.campo}>
      <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
      <TextInput
        placeholderTextColor={cores.textoSutil}
        accessibilityLabel={rotulo}
        {...props}
        style={[estilos.entrada, props.multiline && estilos.multilinha, erro && { borderColor: cores.perigo }, props.editable === false && estilos.inativo]}
      />
      <MensagemCampo erro={erro} ajuda={ajuda} />
    </View>
  );
}

/**
 * Data com o seletor nativo: no Android abre o diálogo do sistema; no iOS, o seletor compacto.
 * Valor em ISO "AAAA-MM-DD" (data de calendário, sem fuso).
 */
export function CampoData({
  rotulo,
  valor,
  onAlterar,
  minimo,
  obrigatorio,
  erro,
  ajuda,
}: {
  rotulo: string;
  valor: string | null;
  onAlterar: (iso: string) => void;
  minimo?: string;
  obrigatorio?: boolean;
  erro?: string | null;
  ajuda?: string | null;
}) {
  const data = valor ? deIsoData(valor) : minimo ? deIsoData(minimo) : new Date();
  const minimumDate = minimo ? deIsoData(minimo) : undefined;

  const abrirAndroid = () =>
    DateTimePickerAndroid.open({
      value: data,
      mode: "date",
      minimumDate,
      title: rotulo,
      onValueChange: (_e, escolhida) => onAlterar(paraIsoData(escolhida)),
    });

  return (
    <View style={estilos.campo}>
      <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
      {Platform.OS === "ios" ? (
        <View style={[estilos.entrada, estilos.linhaIos]}>
          <Text style={{ color: valor ? cores.texto : cores.textoSutil, fontSize: fonte.md }}>{valor ? formatarData(valor) : "Escolha a data"}</Text>
          <DateTimePicker
            value={data}
            mode="date"
            display="compact"
            locale="pt-BR"
            minimumDate={minimumDate}
            accentColor={cores.primaria}
            onValueChange={(_e, escolhida) => onAlterar(paraIsoData(escolhida))}
          />
        </View>
      ) : (
        <Pressable
          onPress={abrirAndroid}
          accessibilityRole="button"
          accessibilityLabel={`${rotulo}: ${valor ? formatarData(valor) : "não escolhida"}`}
          accessibilityHint="Abre o calendário"
          style={({ pressed }) => [estilos.entrada, estilos.linhaData, erro && { borderColor: cores.perigo }, pressed && { backgroundColor: cores.fundo2 }]}
        >
          <Icone nome="calendar" tamanho={20} cor={cores.primaria} />
          <Text style={[estilos.textoData, !valor && { color: cores.textoSutil, fontWeight: "400" }]}>
            {valor ? formatarData(valor) : "Tocar para escolher a data"}
          </Text>
        </Pressable>
      )}
      <MensagemCampo erro={erro} ajuda={ajuda} />
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  campo: { gap: 6 },
  rotulo: { fontSize: fonte.sm, fontWeight: "700", color: cores.texto },
  entrada: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espaco[3],
    fontSize: fonte.md,
    color: cores.texto,
    backgroundColor: cores.superficie,
  },
  multilinha: { minHeight: 96, paddingTop: espaco[3], textAlignVertical: "top" },
  inativo: { backgroundColor: cores.fundo2, color: cores.textoSuave },
  linhaData: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  linhaIos: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  textoData: { fontSize: fonte.md, fontWeight: "600", color: cores.texto },
  erro: { fontSize: fonte.sm, color: cores.perigo, fontWeight: "600" },
  ajuda: { fontSize: fonte.sm, color: cores.textoSuave },
}));
