import type { FiltrosIndicadores } from "@planogestao/api-client";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { AvisoErro } from "../../../components/AvisoErro";
import { CartaoKpi } from "../../../components/CartaoKpi";
import { Icone } from "../../../components/Icone";
import { CartaoGrafico } from "../../../components/graficos/CartaoGrafico";
import { FolhaFiltros } from "../../../components/graficos/FolhaFiltros";
import {
  BarrasEmpilhadas,
  BarrasHorizontais,
  BarrasVerticais,
  Linhas,
  Rosca,
  type Serie,
  Tabela,
} from "../../../components/graficos/Graficos";
import {
  useAcoesPorStatus,
  useCumprimentoPrazo,
  useEvolucaoMensal,
  useIndicadoresGerais,
  usePlanosPorPrazo,
  usePlanosPorSetor,
  usePlanosPorStatus,
  useResponsaveisComPendencias,
} from "../../../hooks/useIndicadores";
import { useOpcoesPlanos } from "../../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../../store/authStore";
import { cores, coresDados, espaco, estilosDinamicos, fonte } from "../../../theme";
import { formatarData, formatarNumero } from "../../../utils/formatos";
import { COR_PRAZO, ROTULO_PERIODO } from "../../../utils/rotulos";

// Mesmas categorias, ordem e nomes do web (fontesIndicadores.tsx).
// Status global (3) e situação do prazo são gráficos separados: um plano em andamento pode estar em atraso.
const STATUS_PLANO = [
  { id: "nao_iniciado", nome: "Não iniciados", cor: coresDados.nao_iniciado },
  { id: "em_andamento", nome: "Em andamento", cor: coresDados.em_andamento },
  { id: "concluido", nome: "Concluídos", cor: coresDados.concluida },
];
// Ações: os mesmos 3 status de execução (o endpoint já agrupa; recusadas/canceladas ficam de fora).
const STATUS_ACAO = [
  { id: "nao_iniciado", nome: "Não iniciado", cor: coresDados.nao_iniciado },
  { id: "em_andamento", nome: "Em andamento", cor: coresDados.em_andamento },
  { id: "concluido", nome: "Concluído", cor: coresDados.concluida },
];
const PRAZO_PLANO = [
  { id: "em_atraso", nome: "Em atraso", cor: COR_PRAZO.em_atraso },
  { id: "a_vencer", nome: "A vencer (até 3 dias)", cor: COR_PRAZO.a_vencer },
  { id: "no_prazo", nome: "No prazo", cor: COR_PRAZO.no_prazo },
];
const SERIES_PLANOS: Serie[] = [
  { chave: "nao_iniciados", nome: "Não iniciados", cor: coresDados.nao_iniciado },
  { chave: "em_andamento", nome: "Em andamento", cor: coresDados.em_andamento },
  { chave: "concluidos", nome: "Concluídos", cor: coresDados.concluida },
];
// Tags de prazo das ações em aberto (mesmas cores em todo o app).
const SERIES_PENDENCIAS: Serie[] = [
  { chave: "atrasadas", nome: "Em atraso", cor: COR_PRAZO.em_atraso },
  { chave: "vencendo", nome: "A vencer (até 3 dias)", cor: COR_PRAZO.a_vencer },
  { chave: "em_andamento", nome: "No prazo", cor: COR_PRAZO.no_prazo },
];
const SERIES_EVOLUCAO: Serie[] = [
  { chave: "criados", nome: "Criados", cor: coresDados.em_andamento },
  { chave: "concluidos", nome: "Concluídos", cor: coresDados.concluida },
  { chave: "atrasados", nome: "Em atraso", cor: COR_PRAZO.em_atraso },
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (iso: string) => {
  const [ano, mes] = iso.split("-");
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano!.slice(2)}`;
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);
const dias = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR")} dias`);

export default function IndicadoresScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const { width } = useWindowDimensions();
  const larguraGrafico = width - espaco[4] * 4; // padding da tela + do cartão
  // Mesmo padrão do web: "ano", sem outros filtros.
  const [filtros, setFiltros] = useState<FiltrosIndicadores>({ periodo: "ano" });
  const [filtrando, setFiltrando] = useState(false);
  const [puxando, setPuxando] = useState(false);

  const opcoes = useOpcoesPlanos();
  const gerais = useIndicadoresGerais(filtros);
  const porStatus = usePlanosPorStatus(filtros);
  const porPrazo = usePlanosPorPrazo(filtros);
  const acoesStatus = useAcoesPorStatus(filtros);
  const cumprimento = useCumprimentoPrazo(filtros);
  const evolucao = useEvolucaoMensal(filtros);
  const porSetor = usePlanosPorSetor(filtros);
  const pendencias = useResponsaveisComPendencias(filtros);
  const todas = [gerais, porStatus, porPrazo, acoesStatus, cumprimento, evolucao, porSetor, pendencias];

  const atualizar = async () => {
    setPuxando(true);
    try {
      await Promise.all(todas.map((q) => q.refetch()));
    } finally {
      setPuxando(false);
    }
  };

  if (!temPermissao(usuario, "indicadores:ver")) return <Redirect href="/mais" />;

  const g = gerais.data;
  const nome = (lista: { id: number; nome: string }[] | undefined, id?: number) => lista?.find((o) => o.id === id)?.nome ?? `#${id}`;
  const chips: { chave: keyof FiltrosIndicadores | "periodo"; texto: string }[] = [
    {
      chave: "periodo",
      texto:
        filtros.periodo === "personalizado" && filtros.data_inicio && filtros.data_fim
          ? `${formatarData(filtros.data_inicio)} a ${formatarData(filtros.data_fim)}`
          : ROTULO_PERIODO[filtros.periodo],
    },
    ...(filtros.area_id ? [{ chave: "area_id" as const, texto: `Área: ${nome(opcoes.data?.areas, filtros.area_id)}` }] : []),
    ...(filtros.setor_id ? [{ chave: "setor_id" as const, texto: `Função/Cargo: ${nome(opcoes.data?.setores, filtros.setor_id)}` }] : []),
    ...(filtros.responsavel_id ? [{ chave: "responsavel_id" as const, texto: `Resp.: ${nome(opcoes.data?.responsaveis, filtros.responsavel_id)}` }] : []),
  ];
  const removerChip = (chave: string) =>
    setFiltros((f) =>
      chave === "periodo" ? { ...f, periodo: "ano", data_inicio: undefined, data_fim: undefined } : { ...f, [chave]: undefined },
    );
  const qtdFiltros = chips.length - (filtros.periodo === "ano" ? 1 : 0);
  const trocando = (q: { isPlaceholderData: boolean }) => q.isPlaceholderData;

  return (
    <View style={estilos.tela}>
      <View style={estilos.barraFiltros}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chips} style={{ flex: 1 }}>
          {chips.map((c) => {
            const removivel = c.chave !== "periodo" || filtros.periodo !== "ano";
            return (
              <Pressable
                key={c.chave}
                onPress={() => (removivel ? removerChip(c.chave) : setFiltrando(true))}
                accessibilityRole="button"
                accessibilityLabel={removivel ? `Filtro ${c.texto}. Toque para remover` : `Período ${c.texto}. Toque para alterar`}
                style={estilos.chip}
              >
                <Text style={estilos.textoChip} numberOfLines={1}>
                  {c.texto}
                </Text>
                {removivel && <Text style={estilos.xChip}>×</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={() => setFiltrando(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filtros${qtdFiltros ? `, ${qtdFiltros} ativo(s)` : ""}`}
          style={({ pressed }) => [estilos.botaoFiltros, pressed && { opacity: 0.8 }]}
        >
          <Icone nome="menu" tamanho={18} cor={cores.primariaTexto} />
          <Text style={estilos.textoBotaoFiltros}>Filtros{qtdFiltros ? ` (${qtdFiltros})` : ""}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={estilos.conteudo}
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
      >
        <Text style={estilos.subtitulo}>
          Planos criados no período filtrado e suas ações.{gerais.isFetching && !gerais.isLoading && !puxando ? " Atualizando…" : ""}
        </Text>

        {gerais.error && !g ? (
          <AvisoErro erro={gerais.error} onTentar={() => void gerais.refetch()} titulo="Não foi possível carregar os indicadores" />
        ) : (
          <View style={[estilos.grade, trocando(gerais) && { opacity: 0.55 }]}>
            <View style={estilos.linha}>
              <CartaoKpi rotulo="% planos concluídos" valor={pct(g?.percentual_planos_concluidos)} cor={coresDados.concluida} carregando={!g}
                dica={g ? `${g.planos_concluidos} de ${g.total_planos} (${g.planos_em_atraso} em atraso)` : undefined} />
              <CartaoKpi rotulo="% ações concluídas" valor={pct(g?.percentual_acoes_concluidas)} cor={coresDados.concluida} carregando={!g}
                dica={g ? `${g.acoes_concluidas} de ${g.total_acoes} ações` : undefined} />
            </View>
            <View style={estilos.linha}>
              <CartaoKpi rotulo="% ações no prazo" valor={pct(g?.percentual_acoes_no_prazo)} cor={coresDados.em_andamento} carregando={!g}
                dica="Concluídas no prazo ÷ (concluídas + em atraso)" />
              <CartaoKpi rotulo="% ações em atraso" valor={pct(g?.percentual_acoes_atrasadas)} cor={COR_PRAZO.em_atraso} carregando={!g}
                dica={g ? `${g.acoes_atrasadas} em aberto, em atraso` : undefined} />
            </View>
            <View style={estilos.linha}>
              <CartaoKpi rotulo="Tempo médio — planos" valor={dias(g?.tempo_medio_conclusao_planos_dias)} cor={coresDados.neutro} carregando={!g}
                dica="Da abertura à conclusão" />
              <CartaoKpi rotulo="Tempo médio — ações" valor={dias(g?.tempo_medio_conclusao_acoes_dias)} cor={coresDados.neutro} carregando={!g}
                dica="Da criação à conclusão" />
            </View>
          </View>
        )}

        <CartaoGrafico
          titulo="Planos por status"
          carregando={porStatus.isLoading}
          erro={!porStatus.data && porStatus.error}
          onTentar={() => void porStatus.refetch()}
          vazio={g?.total_planos === 0}
          atualizando={trocando(porStatus)}
          grafico={() => (
            <Rosca rotuloTotal="planos" fatias={STATUS_PLANO.map((f) => ({ ...f, total: porStatus.data?.find((s) => s.status === f.id)?.total ?? 0 }))} />
          )}
          lista={() => (
            <Tabela colunas={["Status", "Planos"]} linhas={STATUS_PLANO.map((f) => [f.nome, porStatus.data?.find((s) => s.status === f.id)?.total ?? 0])} />
          )}
        />

        <CartaoGrafico
          titulo="Planos por situação do prazo"
          carregando={porPrazo.isLoading}
          erro={!porPrazo.data && porPrazo.error}
          onTentar={() => void porPrazo.refetch()}
          vazio={porPrazo.data?.every((s) => s.total === 0)}
          mensagemVazio="Nenhum plano em aberto (concluídos não têm situação de prazo)."
          atualizando={trocando(porPrazo)}
          grafico={() => (
            <Rosca rotuloTotal="em aberto" fatias={PRAZO_PLANO.map((f) => ({ ...f, total: porPrazo.data?.find((s) => s.status === f.id)?.total ?? 0 }))} />
          )}
          lista={() => (
            <Tabela colunas={["Prazo", "Planos"]} linhas={PRAZO_PLANO.map((f) => [f.nome, porPrazo.data?.find((s) => s.status === f.id)?.total ?? 0])} />
          )}
        />

        <CartaoGrafico
          titulo="Ações por status"
          carregando={acoesStatus.isLoading}
          erro={!acoesStatus.data && acoesStatus.error}
          onTentar={() => void acoesStatus.refetch()}
          vazio={acoesStatus.data?.every((s) => s.total === 0)}
          atualizando={trocando(acoesStatus)}
          grafico={() => (
            <BarrasVerticais
              largura={larguraGrafico}
              dados={STATUS_ACAO.map((f) => ({ ...f, total: acoesStatus.data?.find((s) => s.status === f.id)?.total ?? 0 }))}
            />
          )}
          lista={() => (
            <Tabela colunas={["Status", "Ações"]} linhas={STATUS_ACAO.map((f) => [f.nome, acoesStatus.data?.find((s) => s.status === f.id)?.total ?? 0])} />
          )}
        />

        <CartaoGrafico
          titulo="Cumprimento de prazo"
          carregando={cumprimento.isLoading}
          erro={!cumprimento.data && cumprimento.error}
          onTentar={() => void cumprimento.refetch()}
          vazio={g?.total_acoes === 0}
          atualizando={trocando(cumprimento)}
          grafico={() => {
            const c = cumprimento.data!;
            return (
              <View style={{ gap: espaco[4] }}>
                <View style={estilos.destaque}>
                  <Text style={estilos.valorDestaque}>{pct(c.percentual_no_prazo)}</Text>
                  <Text style={estilos.rotuloDestaque}>das ações em atraso ou concluídas foram entregues até o prazo</Text>
                </View>
                <BarrasHorizontais dados={linhasCumprimento(c)} />
              </View>
            );
          }}
          lista={() => (
            <Tabela
              colunas={["Situação", "Ações"]}
              linhas={[...linhasCumprimento(cumprimento.data!).map((l) => [l.rotulo, l.total]), ["% no prazo", pct(cumprimento.data!.percentual_no_prazo)]]}
            />
          )}
        />

        <CartaoGrafico
          titulo="Evolução dos planos (mensal)"
          carregando={evolucao.isLoading}
          erro={!evolucao.data && evolucao.error}
          onTentar={() => void evolucao.refetch()}
          vazio={evolucao.data?.length === 0}
          atualizando={trocando(evolucao)}
          grafico={() => (
            <Linhas largura={larguraGrafico} pontos={evolucao.data ?? []} rotulos={(evolucao.data ?? []).map((m) => mesCurto(m.mes))} series={SERIES_EVOLUCAO} />
          )}
          lista={() => (
            <Tabela colunas={["Mês", "Criados", "Concluídos", "Em atraso"]} linhas={(evolucao.data ?? []).map((m) => [mesCurto(m.mes), m.criados, m.concluidos, m.atrasados])} />
          )}
        />

        <CartaoGrafico
          titulo="Planos por função/cargo"
          carregando={porSetor.isLoading}
          erro={!porSetor.data && porSetor.error}
          onTentar={() => void porSetor.refetch()}
          vazio={porSetor.data?.length === 0}
          atualizando={trocando(porSetor)}
          grafico={() => <BarrasEmpilhadas series={SERIES_PLANOS} dados={porSetor.data ?? []} />}
          lista={() => (
            <Tabela
              colunas={["Função/Cargo", "Total", "N. inic.", "Andam.", "Concl.", "Em atraso"]}
              linhas={(porSetor.data ?? []).map((s) => [s.nome, s.total, s.nao_iniciados, s.em_andamento, s.concluidos, s.em_atraso])}
            />
          )}
        />

        <CartaoGrafico
          titulo="Responsáveis com ações pendentes"
          carregando={pendencias.isLoading}
          erro={!pendencias.data && pendencias.error}
          onTentar={() => void pendencias.refetch()}
          vazio={pendencias.data?.length === 0}
          mensagemVazio="Nenhuma ação em aberto nos planos filtrados."
          atualizando={trocando(pendencias)}
          grafico={() => <BarrasEmpilhadas series={SERIES_PENDENCIAS} dados={pendencias.data ?? []} />}
          lista={() => (
            <Tabela
              colunas={["Responsável", "Total", "Em atraso", "A vencer", "No prazo"]}
              linhas={(pendencias.data ?? []).map((r) => [r.nome, r.total_pendentes, r.atrasadas, r.vencendo, r.em_andamento])}
            />
          )}
        />

        <Text style={estilos.subtitulo}>
          Período analisado: {ROTULO_PERIODO[filtros.periodo]}
          {filtros.data_inicio && filtros.data_fim && ` (${formatarData(filtros.data_inicio)} a ${formatarData(filtros.data_fim)})`}.
          {g ? ` ${formatarNumero(g.total_planos)} plano(s), ${formatarNumero(g.total_acoes)} ação(ões).` : ""}
        </Text>
      </ScrollView>

      <FolhaFiltros
        visivel={filtrando}
        filtros={filtros}
        opcoes={opcoes.data}
        onFechar={() => setFiltrando(false)}
        onAplicar={(f) => {
          setFiltros(f);
          setFiltrando(false);
        }}
      />
    </View>
  );
}

function linhasCumprimento(c: { concluidas_no_prazo: number; concluidas_com_atraso: number; atrasadas_em_aberto: number; em_aberto_no_prazo: number }) {
  return [
    { rotulo: "Concluídas no prazo", total: c.concluidas_no_prazo },
    { rotulo: "Concluídas com atraso", total: c.concluidas_com_atraso },
    { rotulo: "Em atraso (em aberto)", total: c.atrasadas_em_aberto },
    { rotulo: "Em aberto, no prazo", total: c.em_aberto_no_prazo },
  ];
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  barraFiltros: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[2],
    paddingVertical: espaco[2],
    paddingRight: espaco[4],
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  chips: { gap: espaco[2], paddingHorizontal: espaco[4], alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    maxWidth: 220,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: cores.primariaSuave,
  },
  textoChip: { flexShrink: 1, fontSize: fonte.sm, fontWeight: "700", color: cores.primariaSuaveTexto },
  xChip: { fontSize: fonte.md, fontWeight: "700", color: cores.primariaSuaveTexto },
  botaoFiltros: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: cores.primaria },
  textoBotaoFiltros: { fontSize: fonte.sm, fontWeight: "700", color: cores.primariaTexto },
  conteudo: { padding: espaco[4], gap: espaco[4], paddingBottom: espaco[8] },
  subtitulo: { fontSize: fonte.sm, color: cores.textoSuave },
  grade: { gap: espaco[3] },
  linha: { flexDirection: "row", gap: espaco[3] },
  destaque: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  valorDestaque: { fontSize: fonte.titulo, fontWeight: "800", color: cores.texto, fontVariant: ["tabular-nums"] },
  rotuloDestaque: { flex: 1, fontSize: fonte.sm, color: cores.textoSuave },
}));
