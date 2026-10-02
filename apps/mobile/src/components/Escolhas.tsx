/** Controles de escolha usados nos filtros em bottom sheet (Indicadores, Relatórios). */
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { cores, espaco, estilosDinamicos, fonte, raio } from "../theme";
import { Rotulo } from "./Campos";
import { Icone } from "./Icone";

/** Seletor com lista expansível (rótulos longos e listas grandes, sem Picker nativo). */
export function Escolha({
  rotulo,
  todos,
  valor,
  opcoes,
  onEscolher,
}: {
  rotulo: string;
  todos: string;
  valor: number | undefined;
  opcoes: { id: number; nome: string }[];
  onEscolher: (id: number | undefined) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find((o) => o.id === valor)?.nome ?? todos;
  const escolher = (id: number | undefined) => {
    onEscolher(id);
    setAberto(false);
  };
  return (
    <View style={{ gap: 6 }}>
      <Rotulo texto={rotulo} />
      <Pressable
        onPress={() => setAberto((a) => !a)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        accessibilityLabel={`${rotulo}: ${atual}`}
        style={({ pressed }) => [estilos.seletor, aberto && { borderColor: cores.primaria }, pressed && { backgroundColor: cores.fundo2 }]}
      >
        <Text style={[estilos.textoSeletor, !valor && { color: cores.textoSuave }]} numberOfLines={1}>
          {atual}
        </Text>
        <View style={{ transform: [{ rotate: aberto ? "-90deg" : "90deg" }] }}>
          <Icone nome="chevronRight" tamanho={18} cor={cores.textoSuave} />
        </View>
      </Pressable>
      {aberto && (
        <ScrollView style={estilos.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {[{ id: undefined as number | undefined, nome: todos }, ...opcoes].map((o) => {
            const ativo = o.id === valor;
            return (
              <Pressable
                key={o.id ?? "todos"}
                onPress={() => escolher(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
                style={({ pressed }) => [estilos.opcao, pressed && { backgroundColor: cores.fundo2 }]}
              >
                <Text style={[estilos.textoOpcao, ativo && { fontWeight: "700", color: cores.primariaSuaveTexto }]}>{o.nome}</Text>
                {ativo && <Icone nome="checkCircle" tamanho={16} cor={cores.primaria} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** Chips de escolha única; `vazio` (opcional) é a opção "sem filtro". */
export function ChipsUnico<T extends string>({
  rotulo,
  valor,
  opcoes,
  onEscolher,
  vazio,
}: {
  rotulo: string;
  valor: T | undefined;
  opcoes: { valor: T; rotulo: string }[];
  onEscolher: (v: T | undefined) => void;
  vazio?: string;
}) {
  const todas: { valor: T | undefined; rotulo: string }[] = vazio ? [{ valor: undefined, rotulo: vazio }, ...opcoes] : opcoes;
  return (
    <View style={{ gap: espaco[2] }}>
      <Rotulo texto={rotulo} />
      <View style={estilos.chips} accessibilityRole="radiogroup">
        {todas.map((o) => {
          const ativo = o.valor === valor;
          return (
            <Pressable
              key={o.valor ?? "vazio"}
              onPress={() => onEscolher(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              style={[estilos.chip, ativo && estilos.chipAtivo]}
            >
              <Text style={[estilos.textoChip, ativo && { color: cores.primariaTexto }]}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Chips de múltipla escolha (nenhum marcado = todos). */
export function ChipsMultiplo<T extends string>({
  rotulo,
  valores,
  opcoes,
  onAlterar,
}: {
  rotulo: string;
  valores: T[];
  opcoes: { valor: T; rotulo: string }[];
  onAlterar: (v: T[]) => void;
}) {
  const alternar = (v: T) => onAlterar(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);
  return (
    <View style={{ gap: espaco[2] }}>
      <Rotulo texto={`${rotulo}${valores.length ? ` (${valores.length})` : " — todos"}`} />
      <View style={estilos.chips}>
        {opcoes.map((o) => {
          const ativo = valores.includes(o.valor);
          return (
            <Pressable
              key={o.valor}
              onPress={() => alternar(o.valor)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ativo }}
              style={[estilos.chip, ativo && estilos.chipAtivo]}
            >
              {ativo && <Icone nome="checkCircle" tamanho={14} cor={cores.primariaTexto} />}
              <Text style={[estilos.textoChip, ativo && { color: cores.primariaTexto }]}>{o.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  seletor: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[2],
    paddingHorizontal: espaco[3],
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
  },
  textoSeletor: { flex: 1, fontSize: fonte.md, color: cores.texto },
  lista: { maxHeight: 240, borderWidth: 1, borderColor: cores.borda, borderRadius: raio.md },
  opcao: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: espaco[2], paddingHorizontal: espaco[3], borderBottomWidth: 1, borderBottomColor: cores.borda },
  textoOpcao: { flex: 1, fontSize: fonte.base, color: cores.texto },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: cores.borda,
  },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  textoChip: { fontSize: fonte.sm, fontWeight: "700", color: cores.texto },
}));
