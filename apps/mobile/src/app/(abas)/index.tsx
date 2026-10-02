import type { MinhaAcaoItem, StatusFiltroPlano, TagPrazo, TipoPeriodo } from "@planogestao/shared-types";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { AvisoErro } from "../../components/AvisoErro";
import { BarraProgresso } from "../../components/BarraProgresso";
import { CartaoKpi } from "../../components/CartaoKpi";
import { Icone } from "../../components/Icone";
import { Pilula } from "../../components/Pilula";
import { SeletorPeriodo } from "../../components/SeletorPeriodo";
import { useAcoesDeHoje, useResumoDashboard } from "../../hooks/useInicio";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { cores, coresDados, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, formatarNumero, formatarPercentual } from "../../utils/formatos";
import { COR_PRAZO, selosDaAcao, tagDaSituacao } from "../../utils/rotulos";

function saudacao(agora = new Date()) {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function InicioScreen() {
  const router = useRouter();
  const usuario = useAuthStore((s) => s.usuario);
  const [periodo, setPeriodo] = useState<TipoPeriodo>("mes_atual");
  const [puxando, setPuxando] = useState(false);

  const podeVerPlanos = temPermissao(usuario, "planos:ver");
  const temMinhasAcoes = temPermissao(usuario, "acoes:ver_proprias");

  const resumo = useResumoDashboard(periodo);
  const hoje = useAcoesDeHoje(temMinhasAcoes);
  const r = resumo.data;

  // Pull-to-refresh: o indicador aparece só no gesto (não nos refetch de fundo); a tela continua
  // interativa e mostra os dados atuais até os novos chegarem.
  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await Promise.all([resumo.refetch(), temMinhasAcoes ? hoje.refetch() : Promise.resolve()]);
    } finally {
      setPuxando(false);
    }
  }, [resumo, hoje, temMinhasAcoes]);

  // Drill-down igual ao web: listagem de planos com o status (ou a tag de prazo) do card e o mesmo período.
  const abrirPlanos = (status: StatusFiltroPlano) =>
    router.push({ pathname: "/mais/planos", params: { status, periodo } });
  const abrirPlanosPorPrazo = (prazo: TagPrazo) =>
    router.push({ pathname: "/mais/planos", params: { prazo, periodo } });

  const valor = (n: number | undefined) => (n === undefined ? "—" : formatarNumero(n));

  return (
    <ScrollView
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
    >
      <View style={estilos.cabecalhoLinha}>
        <View style={estilos.cabecalho}>
          <Text style={estilos.ola}>
            {saudacao()}, {usuario?.nome.split(" ")[0]}
          </Text>
          <Text style={estilos.meta}>
            {r ? `${formatarData(r.periodo.inicio)} a ${formatarData(r.periodo.fim)}` : "Carregando período…"}
            {resumo.isFetching && !puxando && r ? " · atualizando…" : ""}
          </Text>
        </View>
        {usuario && <Avatar nome={usuario.nome} url={usuario.avatar_url} tamanho={40} />}
      </View>

      <SeletorPeriodo valor={periodo} onAlterar={setPeriodo} />

      {resumo.error && !r ? (
        <AvisoErro erro={resumo.error} onTentar={() => void resumo.refetch()} titulo="Não foi possível carregar os indicadores" />
      ) : (
        <View style={estilos.grade} accessibilityLabel="Indicadores do período">
          <View style={estilos.linha}>
            <CartaoKpi
              rotulo="Planos Ativos"
              valor={valor(r?.planos_ativos)}
              cor={coresDados.em_andamento}
              carregando={!r}
              onPress={podeVerPlanos ? () => abrirPlanos("em_andamento") : undefined}
            />
            <CartaoKpi
              rotulo="Planos em Atraso"
              valor={valor(r?.planos_atrasados)}
              cor={COR_PRAZO.em_atraso}
              carregando={!r}
              onPress={podeVerPlanos ? () => abrirPlanosPorPrazo("em_atraso") : undefined}
            />
          </View>
          {/* Linha própria: três cartões lado a lado ficam apertados em telas estreitas. */}
          <View style={estilos.linha}>
            <CartaoKpi
              rotulo="Planos Não Iniciados"
              valor={valor(r?.planos_nao_iniciados)}
              dica="Nenhuma ação aceita ou com progresso"
              cor={coresDados.nao_iniciado}
              carregando={!r}
              onPress={podeVerPlanos ? () => abrirPlanos("nao_iniciado") : undefined}
            />
          </View>
          <View style={estilos.linha}>
            <CartaoKpi
              rotulo="Ações Não Iniciadas"
              valor={valor(r?.acoes_pendentes)}
              dica="Aguardando aceite ou aceitas"
              cor={coresDados.nao_iniciado}
              carregando={!r}
            />
            <CartaoKpi
              rotulo="% Cumprimento"
              valor={r ? formatarPercentual(r.percentual_cumprimento) : "—"}
              dica="Concluídas até o prazo"
              cor={coresDados.concluida}
              carregando={!r}
            />
          </View>
        </View>
      )}

      {temMinhasAcoes && (
        <View style={estilos.bloco}>
          <View style={estilos.tituloBloco}>
            <Text style={estilos.titulo}>Minhas ações de hoje</Text>
            {hoje.data && <Text style={estilos.contador}>{hoje.data.total}</Text>}
          </View>
          {hoje.isLoading ? (
            <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[5] }} />
          ) : hoje.error && !hoje.data ? (
            <AvisoErro erro={hoje.error} onTentar={() => void hoje.refetch()} titulo="Não foi possível carregar suas ações" />
          ) : hoje.data && hoje.data.items.length === 0 ? (
            <View style={estilos.vazio}>
              <Icone nome="checkCircle" tamanho={22} cor={coresDados.concluida} />
              <Text style={estilos.textoVazio}>Nenhuma ação sua vence hoje.</Text>
            </View>
          ) : (
            <View style={estilos.lista}>
              {hoje.data?.items.map((a, i) => (
                <ItemAcao key={a.id} acao={a} primeiro={i === 0} onPress={() => router.push({ pathname: "/acoes/[id]", params: { id: String(a.id) } })} />
              ))}
              {hoje.data && hoje.data.total > hoje.data.items.length && (
                <Text style={estilos.mais}>+ {hoje.data.total - hoje.data.items.length} na aba Minhas Ações</Text>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function ItemAcao({ acao, primeiro, onPress }: { acao: MinhaAcaoItem; primeiro: boolean; onPress: () => void }) {
  // Status de execução e tag de prazo à parte (a API só manda a situação; concluída não tem tag).
  const selos = selosDaAcao(acao.status, tagDaSituacao(acao.situacao));
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilos.item, !primeiro && estilos.divisor, pressed && { backgroundColor: cores.fundo2 }]}
      accessibilityRole="button"
      accessibilityLabel={`${acao.descricao}. ${selos.map((x) => x.rotulo).join(". ")}. Plano ${acao.plano.codigo}`}
      accessibilityHint="Abre o detalhe da ação"
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={estilos.descricao} numberOfLines={2}>
          {acao.descricao}
        </Text>
        <Text style={estilos.plano} numberOfLines={1}>
          {acao.plano.codigo} · {acao.plano.nome}
        </Text>
        <View style={estilos.linhaMeta}>
          {selos.map((x) => (
            <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
          ))}
          {acao.solicitacao_pendente && <Text style={estilos.status}>· prazo em revisão</Text>}
        </View>
        <BarraProgresso valor={acao.progresso} />
      </View>
      <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
    </Pressable>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], gap: espaco[4], paddingBottom: espaco[8] },
  cabecalhoLinha: { flexDirection: "row", alignItems: "center", gap: espaco[3] },
  cabecalho: { flex: 1, gap: 2 },
  ola: { fontSize: fonte.xl, fontWeight: "700", color: cores.texto },
  meta: { fontSize: fonte.sm, color: cores.textoSuave },
  grade: { gap: espaco[3] },
  linha: { flexDirection: "row", gap: espaco[3] },
  bloco: { gap: espaco[3] },
  tituloBloco: { flexDirection: "row", alignItems: "center", gap: espaco[2] },
  titulo: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  contador: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: cores.primariaSuave,
    color: cores.primariaSuaveTexto,
    fontSize: fonte.xs,
    fontWeight: "700",
    textAlign: "center",
  },
  lista: { borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: espaco[3], padding: espaco[4] },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  descricao: { fontSize: fonte.base, fontWeight: "600", color: cores.texto },
  plano: { fontSize: fonte.xs, color: cores.textoSuave },
  linhaMeta: { flexDirection: "row", alignItems: "center", gap: espaco[2], flexWrap: "wrap" },
  status: { fontSize: fonte.xs, color: cores.textoSuave },
  vazio: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    padding: espaco[4],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    backgroundColor: cores.superficie,
  },
  textoVazio: { flex: 1, fontSize: fonte.base, color: cores.textoSuave },
  mais: { padding: espaco[3], textAlign: "center", fontSize: fonte.sm, color: cores.textoSuave, borderTopWidth: 1, borderTopColor: cores.borda },
}));
