import type { NotificacaoItem } from "@planogestao/shared-types";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { AvisoErro } from "../../components/AvisoErro";
import { Icone, type NomeIcone } from "../../components/Icone";
import { useMarcarLida, useMarcarTodasLidas, useNotificacoesInfinito } from "../../hooks/useNotificacoes";
import { cores, coresDados, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarDataHora } from "../../utils/formatos";
import { COR_PRAZO } from "../../utils/rotulos";

/** Mesmos tipos do web (utils/notificacoes.ts), com ícones do app. */
const TIPOS: Record<string, { rotulo: string; icone: NomeIcone; cor: string }> = {
  resumo_semanal: { rotulo: "Resumo semanal", icone: "barChart", cor: cores.info },
  acao_atribuida: { rotulo: "Ação atribuída", icone: "userCheck", cor: cores.primaria },
  acao_vencendo: { rotulo: "Prazo próximo", icone: "clock", cor: COR_PRAZO.a_vencer },
  prazo_alterado: { rotulo: "Alteração de prazo", icone: "calendar", cor: cores.info },
  acao_atrasada: { rotulo: "Ação em atraso", icone: "alert", cor: COR_PRAZO.em_atraso },
  acao_concluida: { rotulo: "Ação concluída", icone: "checkCircle", cor: coresDados.concluida },
  dependencia_liberada: { rotulo: "Dependência liberada", icone: "listChecks", cor: cores.primaria },
  solicitacao_prazo: { rotulo: "Solicitação de prazo", icone: "refresh", cor: cores.info },
  resposta_solicitacao_prazo: { rotulo: "Resposta de prazo", icone: "calendar", cor: cores.info },
  plano_vencendo: { rotulo: "Plano a vencer", icone: "clock", cor: COR_PRAZO.a_vencer },
  plano_concluido: { rotulo: "Plano concluído", icone: "checkCircle", cor: coresDados.concluida },
  plano_sem_atualizacao: { rotulo: "Plano sem atualização", icone: "alert", cor: COR_PRAZO.a_vencer },
};
const infoTipo = (tipo: string) => TIPOS[tipo] ?? { rotulo: tipo, icone: "bell" as NomeIcone, cor: cores.textoSuave };

export default function NotificacoesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [puxando, setPuxando] = useState(false);
  const lista = useNotificacoesInfinito(apenasNaoLidas);
  const marcar = useMarcarLida();
  const marcarTodas = useMarcarTodasLidas();

  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.items) ?? [], [lista.data]);
  const naoLidas = lista.data?.pages[0]?.nao_lidas ?? 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        naoLidas > 0 ? (
          <Pressable
            onPress={() => marcarTodas.mutate()}
            disabled={marcarTodas.isPending}
            accessibilityRole="button"
            hitSlop={10}
            style={{ paddingHorizontal: espaco[4] }}
          >
            <Text style={estilos.acaoCabecalho}>{marcarTodas.isPending ? "Marcando…" : "Marcar todas lidas"}</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, naoLidas, marcarTodas]);

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await lista.refetch();
    } finally {
      setPuxando(false);
    }
  }, [lista]);

  const abrir = (n: NotificacaoItem) => {
    if (!n.lida) marcar.mutate(n.id);
    // Mesmas rotas usadas pelo toque no push (services/push.ts → rotaDoPush).
    if (n.referencia_id === null) return;
    if (n.referencia_tipo === "acao") router.push({ pathname: "/acoes/[id]", params: { id: String(n.referencia_id) } });
    else if (n.referencia_tipo === "plano") router.push({ pathname: "/planos/[id]", params: { id: String(n.referencia_id) } });
  };

  return (
    <FlatList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      data={itens}
      keyExtractor={(n) => String(n.id)}
      renderItem={({ item }) => <ItemNotificacao n={item} onPress={() => abrir(item)} />}
      ItemSeparatorComponent={() => <View style={{ height: espaco[2] }} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => lista.hasNextPage && !lista.isFetchingNextPage && void lista.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          <View style={estilos.segmentos} accessibilityRole="tablist">
            {[
              { v: false, t: "Todas" },
              { v: true, t: `Não lidas${naoLidas ? ` (${naoLidas})` : ""}` },
            ].map((o) => (
              <Pressable
                key={o.t}
                onPress={() => setApenasNaoLidas(o.v)}
                accessibilityRole="tab"
                accessibilityState={{ selected: apenasNaoLidas === o.v }}
                style={[estilos.segmento, apenasNaoLidas === o.v && estilos.segmentoAtivo]}
              >
                <Text style={[estilos.textoSegmento, apenasNaoLidas === o.v && { color: cores.texto }]}>{o.t}</Text>
              </Pressable>
            ))}
          </View>
          {lista.error && !lista.data && <AvisoErro erro={lista.error} onTentar={() => void lista.refetch()} />}
          {marcar.isError && <AvisoErro erro={marcar.error} titulo="Não foi possível marcar como lida" />}
        </View>
      }
      ListEmptyComponent={
        lista.isLoading ? (
          <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
        ) : lista.data ? (
          <View style={estilos.vazio}>
            <Icone nome="bell" tamanho={24} cor={cores.textoSutil} />
            <Text style={estilos.textoVazio}>{apenasNaoLidas ? "Nenhuma notificação não lida." : "Nenhuma notificação."}</Text>
          </View>
        ) : null
      }
      ListFooterComponent={lista.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[4] }} /> : null}
    />
  );
}

function ItemNotificacao({ n, onPress }: { n: NotificacaoItem; onPress: () => void }) {
  const t = infoTipo(n.tipo);
  const temDestino = (n.referencia_tipo === "acao" || n.referencia_tipo === "plano") && n.referencia_id !== null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${n.lida ? "" : "Não lida. "}${t.rotulo}. ${n.titulo}. ${n.mensagem}`}
      accessibilityHint={temDestino ? (n.referencia_tipo === "plano" ? "Abre o plano" : "Abre a ação") : n.lida ? undefined : "Marca como lida"}
      style={({ pressed }) => [estilos.item, !n.lida && estilos.itemNaoLido, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={[estilos.icone, { backgroundColor: `${t.cor}1f` }]}>
        <Icone nome={t.icone} tamanho={18} cor={t.cor} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={estilos.linhaTopo}>
          <Text style={[estilos.tipo, { color: t.cor }]}>{t.rotulo}</Text>
          <Text style={estilos.data}>{formatarDataHora(n.criado_em)}</Text>
        </View>
        <Text style={[estilos.titulo, !n.lida && { fontWeight: "800" }]} numberOfLines={2}>
          {n.titulo}
        </Text>
        <Text style={estilos.mensagem} numberOfLines={3}>
          {n.mensagem}
        </Text>
      </View>
      {!n.lida && <View style={estilos.pontoNaoLida} />}
      {temDestino && <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />}
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], paddingBottom: espaco[8] },
  cabecalho: { gap: espaco[3], marginBottom: espaco[3] },
  acaoCabecalho: { fontSize: fonte.sm, fontWeight: "700", color: cores.primaria },
  segmentos: { flexDirection: "row", padding: 3, borderRadius: raio.md, backgroundColor: cores.fundo2 },
  segmento: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: raio.sm },
  segmentoAtivo: { backgroundColor: cores.superficie },
  textoSegmento: { fontSize: fonte.base, fontWeight: "700", color: cores.textoSuave },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    padding: espaco[3],
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  itemNaoLido: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", gap: espaco[2] },
  tipo: { fontSize: fonte.xs, fontWeight: "700" },
  data: { fontSize: fonte.xs, color: cores.textoSutil, fontVariant: ["tabular-nums"] },
  titulo: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  mensagem: { fontSize: fonte.sm, color: cores.textoSuave, lineHeight: escalarTexto(18) },
  pontoNaoLida: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.primaria },
  vazio: { alignItems: "center", gap: espaco[2], paddingVertical: espaco[8] },
  textoVazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center" },
}));
