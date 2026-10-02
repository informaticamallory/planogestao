import type { ConfiguracaoItem } from "@planogestao/shared-types";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";

import { AvisoErro } from "../../../../components/AvisoErro";
import { Botao } from "../../../../components/Botao";
import { Aviso, estilosAdmin } from "../../../../components/admin/UiAdmin";
import { useConfiguracoesAdmin, useMutacaoAdmin } from "../../../../hooks/useAdmin";
import { api } from "../../../../services/api";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../../theme";
import { errosDaApi } from "../../../../utils/errosApi";
import { formatarDataHora } from "../../../../utils/formatos";

export default function ConfiguracoesAdmin() {
  const lista = useConfiguracoesAdmin();
  const grupos = new Map<string, ConfiguracaoItem[]>();
  for (const item of lista.data ?? []) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item]);

  return (
    <ScrollView style={estilosAdmin.tela} contentContainerStyle={estilosAdmin.conteudo} keyboardShouldPersistTaps="handled">
      <Text style={estilosAdmin.texto}>
        Parâmetros globais do sistema. Cada alteração vale para todos os usuários em até 30 segundos e fica registrada com autor e data.
      </Text>
      {lista.isLoading && <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />}
      {lista.error && <AvisoErro erro={lista.error} onTentar={() => void lista.refetch()} />}
      {[...grupos].map(([grupo, itens]) => (
        <View key={grupo} style={estilos.grupo}>
          <Text style={estilos.tituloGrupo} accessibilityRole="header">
            {grupo}
          </Text>
          {itens.map((item) => (
            <LinhaConfiguracao key={item.chave} item={item} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function LinhaConfiguracao({ item }: { item: ConfiguracaoItem }) {
  const [valor, setValor] = useState(String(item.valor));
  const [salvo, setSalvo] = useState(false);
  const salvar = useMutacaoAdmin((v: number) => api.admin.configuracoes.atualizar(item.chave, v));

  // Mesma validação do web; o backend confere o intervalo de novo.
  const numero = Number(valor);
  const invalido = valor.trim() === "" || !Number.isInteger(numero) || numero < item.minimo || numero > item.maximo;
  const alterado = !invalido && numero !== item.valor;
  const erroApi = errosDaApi(salvar.error);

  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{item.rotulo}</Text>
      <Text style={estilosAdmin.texto}>
        {item.descricao} Entre {item.minimo} e {item.maximo} {item.unidade}; padrão {item.padrao}.
      </Text>
      <View style={estilos.controle}>
        <TextInput
          value={valor}
          onChangeText={(v) => {
            setSalvo(false);
            salvar.reset();
            setValor(v.replace(/[^\d-]/g, ""));
          }}
          keyboardType="number-pad"
          accessibilityLabel={`${item.rotulo}, em ${item.unidade}`}
          style={[estilos.entrada, invalido && { borderColor: cores.perigo }]}
        />
        <Text style={estilos.unidade}>{item.unidade}</Text>
        <Botao
          texto="Salvar"
          variante="primaria"
          compacto
          desabilitado={!alterado}
          carregando={salvar.isPending}
          onPress={() => salvar.mutate(numero, { onSuccess: () => setSalvo(true) })}
        />
      </View>
      {invalido && <Text style={estilos.erro}>Use um número inteiro entre {item.minimo} e {item.maximo}.</Text>}
      {erroApi.geral || erroApi.campos.valor ? <Aviso tipo="erro" texto={(erroApi.campos.valor ?? erroApi.geral)!} /> : null}
      {salvo && !alterado && <Aviso tipo="sucesso" texto="Salvo." />}
      <Text style={estilos.meta}>
        {item.atualizado_por ? `Alterado por ${item.atualizado_por} em ${formatarDataHora(item.atualizado_em!)}.` : "Valor inicial do sistema."}
      </Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  grupo: { gap: espaco[3], padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  tituloGrupo: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  linha: { gap: 6, paddingTop: espaco[3], borderTopWidth: 1, borderTopColor: cores.borda },
  rotulo: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  controle: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  entrada: {
    width: 90,
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espaco[3],
    fontSize: fonte.md,
    color: cores.texto,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  unidade: { flex: 1, fontSize: fonte.sm, color: cores.textoSuave },
  erro: { fontSize: fonte.sm, color: cores.perigo, fontWeight: "600" },
  meta: { fontSize: fonte.xs, color: cores.textoSutil },
}));
