import type { SituacaoMinhaAcao } from "@planogestao/api-client";
import type { MinhaAcaoItem, ResumoMinhasAcoes } from "@planogestao/shared-types";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { AvisoErro } from "../../components/AvisoErro";
import { BarraProgresso } from "../../components/BarraProgresso";
import { Icone } from "../../components/Icone";
import { Pilula } from "../../components/Pilula";
import { useMinhasAcoesInfinito, useResumoMinhasAcoes } from "../../hooks/useMinhasAcoes";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, formatarNumero } from "../../utils/formatos";
import { SITUACAO, rotuloNumeroAcao, selosDaAcao, tagDaSituacao } from "../../utils/rotulos";

/** Mesmos 4 filtros do web (Fase 7), na mesma ordem; nomes = tags de prazo (valores da API inalterados). */
const FILTROS: { situacao: SituacaoMinhaAcao; chave: keyof ResumoMinhasAcoes; nome: string }[] = [
  { situacao: "atrasada", chave: "atrasadas", nome: SITUACAO.atrasada.rotulo },
  { situacao: "vencendo", chave: "vencendo", nome: SITUACAO.vencendo.rotulo },
  { situacao: "em_andamento", chave: "em_andamento", nome: SITUACAO.em_andamento.rotulo },
  { situacao: "concluida", chave: "concluidas", nome: SITUACAO.concluida.rotulo },
];

export default function MinhasAcoesScreen() {
  const router = useRouter();
  const [situacao, setSituacao] = useState<SituacaoMinhaAcao | undefined>(undefined);
  const [puxando, setPuxando] = useState(false);

  const resumo = useResumoMinhasAcoes();
  const lista = useMinhasAcoesInfinito(situacao);
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.items) ?? [], [lista.data]);
  const total = lista.data?.pages[0]?.total;
  const trocandoFiltro = lista.isPlaceholderData;

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await Promise.all([resumo.refetch(), lista.refetch()]);
    } finally {
      setPuxando(false);
    }
  }, [resumo, lista]);

  // Tocar no filtro ativo volta para "todas" (mesmo comportamento dos cartões do web).
  const filtrar = (s: SituacaoMinhaAcao) => setSituacao((atual) => (atual === s ? undefined : s));
  const nomeFiltro = FILTROS.find((f) => f.situacao === situacao)?.nome;

  return (
    <View style={estilos.tela}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={estilos.barraChips}
        contentContainerStyle={estilos.chips}
        accessibilityRole="tablist"
      >
        {FILTROS.map((f) => {
          const ativo = situacao === f.situacao;
          const cor = SITUACAO[f.situacao].cor;
          const n = resumo.data?.[f.chave];
          return (
            <Pressable
              key={f.situacao}
              onPress={() => filtrar(f.situacao)}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativo }}
              accessibilityLabel={`${f.nome}: ${n ?? "carregando"}`}
              accessibilityHint={ativo ? "Toque de novo para ver todas" : undefined}
              style={({ pressed }) => [estilos.chip, ativo && { backgroundColor: cor, borderColor: cor }, pressed && { opacity: 0.8 }]}
            >
              {!ativo && <View style={[estilos.ponto, { backgroundColor: cor }]} />}
              <Text style={[estilos.textoChip, ativo && { color: "#ffffff" }]}>{f.nome}</Text>
              <Text style={[estilos.contagem, ativo ? { color: "#ffffff", backgroundColor: "rgba(255,255,255,0.22)" } : { color: cor, backgroundColor: `${cor}1f` }]}>
                {n === undefined ? "…" : formatarNumero(n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={estilos.conteudo}
        data={itens}
        keyExtractor={(a) => String(a.id)}
        renderItem={({ item }) => <ItemAcao acao={item} onPress={() => router.push({ pathname: "/acoes/[id]", params: { id: String(item.id) } })} />}
        ItemSeparatorComponent={() => <View style={{ height: espaco[3] }} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => lista.hasNextPage && !lista.isFetchingNextPage && void lista.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <Text style={estilos.total}>
              {total === undefined
                ? "Carregando…"
                : `${nomeFiltro ? `${nomeFiltro}: ` : ""}${formatarNumero(total)} aç${total === 1 ? "ão" : "ões"}`}
              {trocandoFiltro ? " · atualizando…" : ""}
            </Text>
            {resumo.error && !resumo.data && <AvisoErro erro={resumo.error} onTentar={() => void resumo.refetch()} titulo="Não foi possível carregar os contadores" />}
            {lista.error && !lista.data && <AvisoErro erro={lista.error} onTentar={() => void lista.refetch()} />}
          </View>
        }
        ListEmptyComponent={
          lista.isLoading ? (
            <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
          ) : lista.data ? (
            <View style={estilos.vazio}>
              <Icone nome="checkCircle" tamanho={24} cor={cores.textoSutil} />
              <Text style={estilos.textoVazio}>{situacao ? "Nenhuma ação nesta situação." : "Você não tem ações atribuídas."}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={lista.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[4] }} /> : null}
      />
    </View>
  );
}

function ItemAcao({ acao, onPress }: { acao: MinhaAcaoItem; onPress: () => void }) {
  // Status de execução e tag de prazo à parte (a API só manda a situação; concluída não tem tag).
  const selos = selosDaAcao(acao.status, tagDaSituacao(acao.situacao));
  const aguardando = acao.status === "aguardando_aceite";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilos.cartao, aguardando && estilos.cartaoDestaque, pressed && { backgroundColor: cores.fundo2 }]}
      accessibilityRole="button"
      accessibilityLabel={`${rotuloNumeroAcao(acao.numero)}: ${acao.descricao}.${acao.acao_origem ? ` Origem: ${acao.acao_origem}.` : ""} Plano ${acao.plano.codigo}. Prazo de conclusão ${formatarData(acao.prazo)}. ${selos.map((x) => x.rotulo).join(". ")}. Progresso ${acao.progresso}%`}
      accessibilityHint="Abre o detalhe da ação"
    >
      {/* Só o código do plano, sem link: o responsável por uma subação pode não ter acesso ao plano. */}
      <View style={estilos.topo}>
        <Text style={estilos.codigo} numberOfLines={1}>
          {rotuloNumeroAcao(acao.numero)} · {acao.plano.codigo}
        </Text>
        <View style={estilos.selos}>
          {selos.map((x) => (
            <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
          ))}
        </View>
      </View>
      <Text style={estilos.descricao} numberOfLines={2}>
        {acao.descricao}
      </Text>
      {acao.acao_origem && (
        <Text style={estilos.meta} numberOfLines={2}>
          Origem: {acao.acao_origem}
        </Text>
      )}
      <View style={estilos.linhaMeta}>
        <Icone nome="calendar" tamanho={14} cor={acao.situacao === "atrasada" ? cores.perigo : cores.textoSuave} />
        <Text style={[estilos.meta, acao.situacao === "atrasada" && { color: cores.perigo, fontWeight: "700" }]}>Prazo de conclusão {formatarData(acao.prazo)}</Text>
        {acao.solicitacao_pendente && <Text style={estilos.meta}>· prazo em revisão</Text>}
      </View>
      <BarraProgresso valor={acao.progresso} />
      {aguardando && !acao.solicitacao_pendente && <Text style={estilos.chamada}>Toque para aceitar ou pedir outro prazo</Text>}
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  barraChips: { flexGrow: 0, backgroundColor: cores.superficie, borderBottomWidth: 1, borderBottomColor: cores.borda },
  chips: { gap: espaco[2], paddingHorizontal: espaco[4], paddingVertical: espaco[3] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  textoChip: { fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  contagem: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: fonte.sm,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  conteudo: { padding: espaco[4], paddingBottom: espaco[8] },
  cabecalho: { gap: espaco[3], marginBottom: espaco[3] },
  total: { fontSize: fonte.sm, fontWeight: "600", color: cores.textoSuave },
  cartao: { gap: 6, padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  cartaoDestaque: { borderColor: cores.violeta, borderWidth: 1.5 },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[2] },
  selos: { flexShrink: 1, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: espaco[1] },
  codigo: { flexShrink: 1, fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, fontVariant: ["tabular-nums"], letterSpacing: 0.3 },
  descricao: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  linhaMeta: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  meta: { fontSize: fonte.sm, color: cores.textoSuave },
  chamada: { fontSize: fonte.sm, fontWeight: "700", color: cores.violeta },
  vazio: { alignItems: "center", gap: espaco[2], paddingVertical: espaco[8] },
  textoVazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center" },
}));
