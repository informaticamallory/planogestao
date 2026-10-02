import type { PlanoListaItem, StatusFiltroPlano, TagPrazo, TipoPeriodo } from "@planogestao/shared-types";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { AvisoErro } from "../../../components/AvisoErro";
import { BarraProgresso } from "../../../components/BarraProgresso";
import { Icone } from "../../../components/Icone";
import { Pilula } from "../../../components/Pilula";
import { usePlanosInfinito } from "../../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../../store/authStore";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../theme";
import { formatarData, formatarNumero } from "../../../utils/formatos";
import { ROTULO_PERIODO, ROTULO_PRAZO, ROTULO_STATUS_FILTRO_PLANO, statusDoPlano, tagDePrazo } from "../../../utils/rotulos";

const STATUS_VALIDOS = Object.keys(ROTULO_STATUS_FILTRO_PLANO) as StatusFiltroPlano[];
const PRAZOS_VALIDOS = Object.keys(ROTULO_PRAZO) as TagPrazo[];
const PERIODOS_VALIDOS = Object.keys(ROTULO_PERIODO).filter((p) => p !== "personalizado") as TipoPeriodo[];

export default function PlanosScreen() {
  const router = useRouter();
  const usuario = useAuthStore((s) => s.usuario);
  const params = useLocalSearchParams<{ status?: string; prazo?: string; periodo?: string }>();
  const [puxando, setPuxando] = useState(false);

  // Parâmetros vindos de fora (card do Início, deep link): só valores conhecidos.
  const filtro = useMemo(
    () => ({
      status: STATUS_VALIDOS.includes(params.status as StatusFiltroPlano) ? (params.status as StatusFiltroPlano) : undefined,
      prazo: PRAZOS_VALIDOS.includes(params.prazo as TagPrazo) ? (params.prazo as TagPrazo) : undefined,
      periodo: PERIODOS_VALIDOS.includes(params.periodo as TipoPeriodo) ? (params.periodo as TipoPeriodo) : undefined,
    }),
    [params.status, params.prazo, params.periodo],
  );

  const lista = usePlanosInfinito(filtro);
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.items) ?? [], [lista.data]);
  const total = lista.data?.pages[0]?.total;

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await lista.refetch();
    } finally {
      setPuxando(false);
    }
  }, [lista]);

  if (!temPermissao(usuario, "planos:ver")) return <Redirect href="/mais" />;

  const temFiltro = !!(filtro.status || filtro.prazo || filtro.periodo);

  return (
    <FlatList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      data={itens}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => (
        <ItemPlano plano={item} onPress={() => router.push({ pathname: "/planos/[id]", params: { id: String(item.id) } })} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: espaco[3] }} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => lista.hasNextPage && !lista.isFetchingNextPage && void lista.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          {temFiltro && (
            <View style={estilos.filtros} accessibilityLabel="Filtros aplicados">
              {filtro.status && <Chip texto={ROTULO_STATUS_FILTRO_PLANO[filtro.status]} />}
              {filtro.prazo && <Chip texto={`Prazo: ${ROTULO_PRAZO[filtro.prazo].toLowerCase()}`} />}
              {filtro.periodo && <Chip texto={`Criados: ${ROTULO_PERIODO[filtro.periodo].toLowerCase()}`} />}
              <Pressable
                onPress={() => router.setParams({ status: undefined, prazo: undefined, periodo: undefined })}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={estilos.limpar}>Limpar</Text>
              </Pressable>
            </View>
          )}
          <Text style={estilos.total}>
            {total === undefined ? "Carregando…" : `${formatarNumero(total)} plano${total === 1 ? "" : "s"}`}
          </Text>
          {lista.error && !lista.data && <AvisoErro erro={lista.error} onTentar={() => void lista.refetch()} />}
        </View>
      }
      ListEmptyComponent={
        lista.isLoading ? (
          <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
        ) : lista.data ? (
          <View style={estilos.vazio}>
            <Icone nome="listChecks" tamanho={24} cor={cores.textoSutil} />
            <Text style={estilos.textoVazio}>{temFiltro ? "Nenhum plano com esses filtros." : "Nenhum plano visível para você."}</Text>
          </View>
        ) : null
      }
      ListFooterComponent={lista.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[4] }} /> : null}
    />
  );
}

function Chip({ texto }: { texto: string }) {
  return (
    <View style={estilos.chip}>
      <Icone nome="listChecks" tamanho={13} cor={cores.primariaSuaveTexto} />
      <Text style={estilos.textoChip}>{texto}</Text>
    </View>
  );
}

function ItemPlano({ plano, onPress }: { plano: PlanoListaItem; onPress: () => void }) {
  const s = statusDoPlano(plano.status);
  const t = plano.prazo_tag ? tagDePrazo(plano.prazo_tag) : null;
  const extras = [t?.rotulo, plano.rascunho && "Rascunho", plano.arquivado && "Arquivado"].filter(Boolean).join(". ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilos.cartao, pressed && { backgroundColor: cores.fundo2 }]}
      accessibilityRole="button"
      accessibilityHint="Abre o detalhe do plano"
      accessibilityLabel={`${plano.codigo}, ${plano.nome}. ${s.rotulo}.${extras ? ` ${extras}.` : ""} Fim estimado ${formatarData(plano.data_fim_estimado)}. Progresso ${Math.round(plano.progresso)}%`}
    >
      <View style={estilos.topoCartao}>
        <Text style={estilos.codigo}>{plano.codigo}</Text>
        {plano.arquivado && <Pilula texto="Arquivado" cor={cores.textoSuave} />}
      </View>
      {/* Status e prazo são independentes: um plano pode estar "Em andamento" e "Em atraso". */}
      <View style={estilos.selos}>
        <Pilula texto={s.rotulo} cor={s.cor} />
        {t && <Pilula texto={t.rotulo} cor={t.cor} />}
        {plano.rascunho && <Pilula texto="Rascunho" cor={cores.textoSuave} />}
      </View>
      <Text style={estilos.nome} numberOfLines={2}>
        {plano.nome}
      </Text>
      <Text style={estilos.meta} numberOfLines={1}>
        {plano.area.nome} · {plano.responsavel.nome} · fim estimado {formatarData(plano.data_fim_estimado)}
      </Text>
      <BarraProgresso valor={plano.progresso} />
      <Text style={estilos.acoes}>
        {plano.acoes_concluidas} de {plano.total_acoes} ações concluídas
      </Text>
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], paddingBottom: espaco[8] },
  cabecalho: { gap: espaco[3], marginBottom: espaco[3] },
  filtros: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: espaco[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: cores.primariaSuave,
  },
  textoChip: { fontSize: fonte.sm, fontWeight: "600", color: cores.primariaSuaveTexto },
  limpar: { fontSize: fonte.sm, fontWeight: "700", color: cores.textoSuave, textDecorationLine: "underline" },
  total: { fontSize: fonte.sm, fontWeight: "600", color: cores.textoSuave },
  cartao: { gap: 6, padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  topoCartao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[2] },
  selos: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  codigo: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, fontVariant: ["tabular-nums"], letterSpacing: 0.3 },
  nome: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  meta: { fontSize: fonte.xs, color: cores.textoSuave },
  acoes: { fontSize: fonte.xs, color: cores.textoSutil },
  vazio: { alignItems: "center", gap: espaco[2], paddingVertical: espaco[8] },
  textoVazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center" },
}));
