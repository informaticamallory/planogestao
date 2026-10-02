/**
 * Fluxo comum dos relatórios (mesmo do web, Fase 10): os filtros são editados num RASCUNHO no bottom
 * sheet; "Gerar relatório" os APLICA. Pré-visualização e exportação usam só os aplicados.
 */
import type { FormatoExportacao } from "@planogestao/shared-types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { mensagemDeErro } from "../../hooks/useAuth";
import { exportarECompartilhar } from "../../services/exportacao";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarDataHora, formatarNumero } from "../../utils/formatos";
import { AvisoErro } from "../AvisoErro";
import { Botao } from "../Botao";
import { FolhaInferior } from "../FolhaInferior";
import { Icone } from "../Icone";

export type Filtros = Record<string, string | number | undefined | string[]>;

interface Pagina<T> {
  filtros_aplicados: string[];
  gerado_em: string;
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

const TAMANHO_PAGINA = 50; // mesmo padrão do web

/** Igual a comPeriodoValido do web: "personalizado" só vai com as duas datas; período vazio = qualquer data. */
export function comPeriodoValido<T>(f: Filtros): T {
  const { periodo, data_inicio, data_fim, ...resto } = f;
  const consulta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resto)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    consulta[k] = v;
  }
  if (periodo && (periodo !== "personalizado" || (data_inicio && data_fim))) {
    consulta.periodo = periodo;
    if (periodo === "personalizado") Object.assign(consulta, { data_inicio, data_fim });
  }
  return consulta as T;
}

const FORMATOS: { formato: FormatoExportacao; nome: string; detalhe: string }[] = [
  { formato: "xlsx", nome: "Excel", detalhe: "Planilha com aba de filtros" },
  { formato: "csv", nome: "CSV", detalhe: "Só os dados (separador ;)" },
  { formato: "pdf", nome: "PDF", detalhe: "Pronto para enviar ou imprimir" },
];

export function TelaRelatorio<T extends { id: number }>({
  id,
  titulo,
  nomeArquivo,
  consultar,
  urlExportacao,
  exportarPelaApi,
  renderFiltros,
  renderItem,
}: {
  id: "planos" | "acoes";
  titulo: string;
  nomeArquivo: string;
  consultar: (f: Filtros, page: number, pageSize: number) => Promise<Pagina<T>>;
  urlExportacao: (f: Filtros, formato: FormatoExportacao) => string;
  exportarPelaApi: (f: Filtros, formato: FormatoExportacao) => Promise<unknown>;
  renderFiltros: (rascunho: Filtros, alterar: (parcial: Filtros) => void) => ReactNode;
  renderItem: (item: T) => ReactNode;
}) {
  const [aplicados, setAplicados] = useState<Filtros | null>(null); // null = ainda não gerado
  const [rascunho, setRascunho] = useState<Filtros>({});
  const [filtrando, setFiltrando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [formatoEmCurso, setFormatoEmCurso] = useState<FormatoExportacao | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  const [puxando, setPuxando] = useState(false);

  useEffect(() => {
    if (filtrando) setRascunho(aplicados ?? {});
  }, [filtrando, aplicados]);

  const relatorio = useInfiniteQuery({
    queryKey: ["relatorios", id, aplicados],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => consultar(aplicados!, pageParam, TAMANHO_PAGINA),
    getNextPageParam: (u) => (u.page * u.page_size < u.total ? u.page + 1 : undefined),
    enabled: aplicados !== null,
  });
  const primeira = relatorio.data?.pages[0];
  const itens = useMemo(() => relatorio.data?.pages.flatMap((p) => p.items) ?? [], [relatorio.data]);

  const gerar = () => {
    setAplicados({ ...rascunho });
    setFiltrando(false);
  };

  const exportar = async (formato: FormatoExportacao) => {
    if (!aplicados) return;
    setErroExportacao(null);
    setFormatoEmCurso(formato);
    try {
      await exportarECompartilhar({
        url: urlExportacao(aplicados, formato),
        formato,
        nomePadrao: nomeArquivo,
        titulo,
        explicarErro: () => exportarPelaApi(aplicados, formato),
      });
      setExportando(false);
    } catch (erro) {
      setErroExportacao(mensagemDeErro(erro));
    } finally {
      setFormatoEmCurso(null);
    }
  };

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await relatorio.refetch();
    } finally {
      setPuxando(false);
    }
  }, [relatorio]);

  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.barra}>
        <Botao texto="Filtros" icone="menu" onPress={() => setFiltrando(true)} compacto flex />
        <Botao
          texto="Exportar"
          icone="fileText"
          variante="primaria"
          onPress={() => {
            setErroExportacao(null);
            setExportando(true);
          }}
          desabilitado={!primeira || primeira.total === 0}
          compacto
          flex
        />
      </View>

      {aplicados === null ? (
        <View style={estilos.inicio}>
          <Icone nome="fileText" tamanho={32} cor={cores.textoSutil} />
          <Text style={estilos.textoInicio}>Defina os filtros e toque em “Gerar relatório” para ver a pré-visualização.</Text>
          <Botao texto="Definir filtros" variante="primaria" icone="menu" onPress={() => setFiltrando(true)} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={estilos.conteudo}
          data={itens}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <>{renderItem(item)}</>}
          ItemSeparatorComponent={() => <View style={{ height: espaco[3] }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => relatorio.hasNextPage && !relatorio.isFetchingNextPage && void relatorio.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
          ListHeaderComponent={
            <View style={estilos.resumo}>
              {relatorio.error && !primeira ? (
                <AvisoErro erro={relatorio.error} onTentar={() => void relatorio.refetch()} titulo="Não foi possível gerar o relatório" />
              ) : primeira ? (
                <>
                  <Text style={estilos.total}>
                    {formatarNumero(primeira.total)} registro(s) · gerado em {formatarDataHora(primeira.gerado_em)}
                    {relatorio.isFetching && !puxando && !relatorio.isFetchingNextPage ? " · atualizando…" : ""}
                  </Text>
                  {/* Mesma descrição de filtros que vai no arquivo exportado (vem do backend). */}
                  <View style={estilos.chips}>
                    {primeira.filtros_aplicados.length === 0 ? (
                      <Text style={estilos.semFiltro}>Sem filtros</Text>
                    ) : (
                      primeira.filtros_aplicados.map((f) => (
                        <View key={f} style={estilos.chip}>
                          <Text style={estilos.textoChip}>{f}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            relatorio.isLoading ? (
              <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
            ) : primeira ? (
              <Text style={estilos.vazio}>Nenhum registro com esses filtros.</Text>
            ) : null
          }
          ListFooterComponent={relatorio.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[4] }} /> : null}
        />
      )}

      <FolhaInferior visivel={filtrando} titulo={`Filtros — ${titulo}`} onFechar={() => setFiltrando(false)}>
        {renderFiltros(rascunho, (parcial) => setRascunho((a) => ({ ...a, ...parcial })))}
        <View style={estilos.botoes}>
          <Botao texto="Limpar" onPress={() => setRascunho({})} flex />
          <Botao texto="Gerar relatório" variante="primaria" icone="checkCircle" onPress={gerar} flex />
        </View>
      </FolhaInferior>

      <FolhaInferior visivel={exportando} titulo="Exportar relatório" onFechar={() => formatoEmCurso === null && setExportando(false)}>
        <Text style={estilos.apoio}>
          O arquivo é gerado no servidor com os filtros aplicados ({formatarNumero(primeira?.total ?? 0)} registro(s)) e aberto no menu do
          aparelho para salvar, enviar ou imprimir.
        </Text>
        {FORMATOS.map((f) => (
          <Pressable
            key={f.formato}
            onPress={() => void exportar(f.formato)}
            disabled={formatoEmCurso !== null}
            accessibilityRole="button"
            accessibilityLabel={`Exportar em ${f.nome}`}
            style={({ pressed }) => [estilos.formato, pressed && { backgroundColor: cores.fundo2 }, formatoEmCurso && formatoEmCurso !== f.formato && { opacity: 0.5 }]}
          >
            <View style={estilos.iconeFormato}>
              <Icone nome="fileText" tamanho={20} cor={cores.primariaSuaveTexto} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nomeFormato}>{f.nome}</Text>
              <Text style={estilos.apoio}>{f.detalhe}</Text>
            </View>
            {formatoEmCurso === f.formato ? <ActivityIndicator color={cores.primaria} /> : <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />}
          </Pressable>
        ))}
        {erroExportacao && (
          <Text style={estilos.erro} accessibilityRole="alert">
            {erroExportacao}
          </Text>
        )}
      </FolhaInferior>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  barra: {
    flexDirection: "row",
    gap: espaco[3],
    paddingHorizontal: espaco[4],
    paddingVertical: espaco[3],
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  inicio: { flex: 1, alignItems: "center", justifyContent: "center", gap: espaco[4], padding: espaco[6] },
  textoInicio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", lineHeight: escalarTexto(20) },
  conteudo: { padding: espaco[4], paddingBottom: espaco[8] },
  resumo: { gap: espaco[2], marginBottom: espaco[3] },
  total: { fontSize: fonte.sm, fontWeight: "700", color: cores.texto },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: cores.primariaSuave },
  textoChip: { fontSize: fonte.xs, fontWeight: "700", color: cores.primariaSuaveTexto },
  semFiltro: { fontSize: fonte.sm, color: cores.textoSuave },
  vazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center", paddingVertical: espaco[8] },
  botoes: { flexDirection: "row", gap: espaco[3] },
  apoio: { fontSize: fonte.sm, color: cores.textoSuave, lineHeight: escalarTexto(18) },
  formato: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    minHeight: 64,
    paddingHorizontal: espaco[3],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
  },
  iconeFormato: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: cores.primariaSuave },
  nomeFormato: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  erro: { fontSize: fonte.sm, fontWeight: "600", color: cores.perigo },
}));
