import type { SetorItem } from "@planogestao/shared-types";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

import { AvisoErro } from "../../../../../../components/AvisoErro";
import { Escolha } from "../../../../../../components/Escolhas";
import { BotaoNovo, ItemAdmin, estilosAdmin } from "../../../../../../components/admin/UiAdmin";
import { CADASTROS, ehTipoCadastro, useCadastro } from "../../../../../../components/admin/cadastros";
import { cores, espaco } from "../../../../../../theme";

export default function ListaCadastro() {
  const router = useRouter();
  const { tipo } = useLocalSearchParams<{ tipo: string }>();
  const valido = ehTipoCadastro(tipo);
  const { consulta, areas } = useCadastro(valido ? tipo : "areas");
  const [filtroArea, setFiltroArea] = useState<number | undefined>();
  const [puxando, setPuxando] = useState(false);
  if (!valido) return <Redirect href="/mais/admin" />;

  const cfg = CADASTROS[tipo];
  const itens = (consulta.data ?? []).filter((i) => tipo !== "setores" || !filtroArea || (i as SetorItem).area_id === filtroArea);
  const abrir = (id: string) =>
    router.push({ pathname: "/mais/admin/cadastros/[tipo]/[id]", params: { tipo, id, ...(filtroArea && id === "novo" ? { area_id: String(filtroArea) } : {}) } });

  return (
    <FlatList
      style={estilosAdmin.tela}
      contentContainerStyle={estilosAdmin.conteudo}
      data={itens}
      keyExtractor={(i) => String(i.id)}
      renderItem={({ item }) => <ItemAdmin titulo={item.nome} subtitulo={cfg.detalhe(item)} ativo={item.ativo} onPress={() => abrir(String(item.id))} />}
      refreshControl={
        <RefreshControl
          refreshing={puxando}
          onRefresh={async () => {
            setPuxando(true);
            try {
              await consulta.refetch();
            } finally {
              setPuxando(false);
            }
          }}
          colors={[cores.primaria]}
          tintColor={cores.primaria}
        />
      }
      ListHeaderComponent={
        <View style={estilosAdmin.cabecalho}>
          <Stack.Screen options={{ title: cfg.titulo }} />
          <BotaoNovo texto={`${cfg.feminino ? "Nova" : "Novo"} ${cfg.rotulo}`} onPress={() => abrir("novo")} />
          <Text style={estilosAdmin.texto}>{cfg.descricao}</Text>
          {tipo === "setores" && <Escolha rotulo="Área" todos="Todas" valor={filtroArea} opcoes={areas.data ?? []} onEscolher={setFiltroArea} />}
          {consulta.error && <AvisoErro erro={consulta.error} onTentar={() => void consulta.refetch()} />}
        </View>
      }
      ListEmptyComponent={
        consulta.isLoading ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} /> : consulta.data ? <Text style={estilosAdmin.vazio}>Nenhum registro.</Text> : null
      }
    />
  );
}
