import { ApiError } from "@planogestao/api-client";
import type { AcaoDoPlano } from "@planogestao/shared-types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { AvisoErro } from "../../components/AvisoErro";
import { BarraProgresso } from "../../components/BarraProgresso";
import { Icone } from "../../components/Icone";
import { Pilula } from "../../components/Pilula";
import { useAcoesDoPlano, usePlanoDetalhe } from "../../hooks/usePlano";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, formatarDataHora } from "../../utils/formatos";
import { ROTULO_PRIORIDADE, acaoEmAberto, rotuloNumeroAcao, selosDaAcao, statusDoPlano, tagDePrazo } from "../../utils/rotulos";

/** Detalhe do plano, somente leitura (edição do plano continua no web). */
export default function DetalhePlanoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const planoId = Number(id);
  const plano = usePlanoDetalhe(planoId);
  const acoes = useAcoesDoPlano(planoId);
  const [puxando, setPuxando] = useState(false);

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await Promise.all([plano.refetch(), acoes.refetch()]);
    } finally {
      setPuxando(false);
    }
  }, [plano, acoes]);

  const p = plano.data;
  const titulo = <Stack.Screen options={{ title: p?.codigo ?? "Plano" }} />;

  if (plano.error instanceof ApiError && (plano.error.status === 404 || plano.error.status === 403)) {
    return (
      <View style={estilos.centro}>
        {titulo}
        <Icone nome="alert" tamanho={28} cor={cores.textoSutil} />
        <Text style={estilos.tituloVazio}>Plano não encontrado</Text>
        <Text style={estilos.apoio}>O plano não existe ou você não tem acesso a ele.</Text>
      </View>
    );
  }
  if (plano.error && !p) {
    return (
      <View style={[estilos.tela, { padding: espaco[4] }]}>
        {titulo}
        <AvisoErro erro={plano.error} onTentar={() => void plano.refetch()} titulo="Não foi possível carregar o plano" />
      </View>
    );
  }
  if (!p) {
    return (
      <View style={estilos.centro}>
        {titulo}
        <ActivityIndicator color={cores.primaria} size="large" />
      </View>
    );
  }

  const s = statusDoPlano(p.status);
  const t = p.prazo_tag ? tagDePrazo(p.prazo_tag) : null;
  const fimEstimado =
    p.status === "concluido" ? formatarData(p.data_fim_estimado)
    : p.dias_para_prazo < 0 ? `${formatarData(p.data_fim_estimado)} · vencido há ${-p.dias_para_prazo} dia(s)`
    : p.dias_para_prazo === 0 ? `${formatarData(p.data_fim_estimado)} · vence hoje`
    : `${formatarData(p.data_fim_estimado)} · faltam ${p.dias_para_prazo} dia(s)`;

  return (
    <ScrollView
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
    >
      {titulo}
      <View style={{ gap: espaco[3] }}>
        <Text style={estilos.nome} accessibilityRole="header">
          {p.nome}
        </Text>
        {/* Status e prazo são independentes: um plano pode estar "Em andamento" e "Em atraso". */}
        <View style={estilos.selos}>
          <Pilula texto={s.rotulo} cor={s.cor} />
          {t && <Pilula texto={t.rotulo} cor={t.cor} />}
          {p.rascunho && <Pilula texto="Rascunho" cor={cores.textoSuave} />}
          {p.arquivado_em && <Pilula texto="Arquivado" cor={cores.textoSuave} />}
          <Pilula texto={ROTULO_PRIORIDADE[p.prioridade]} cor={cores.textoSuave} />
        </View>
        {p.arquivado_em && (
          <View style={estilos.faixaArquivado} accessibilityRole="text">
            <Icone nome="alert" tamanho={18} cor={cores.textoSuave} />
            <Text style={estilos.textoFaixa}>
              Plano arquivado em {formatarDataHora(p.arquivado_em)}
              {p.arquivado_por && ` por ${p.arquivado_por.nome}`}. Somente leitura.
            </Text>
          </View>
        )}
        <View style={estilos.caixa}>
          <Meta rotulo="Responsável" valor={p.responsavel.nome} />
          <Meta rotulo="Área" valor={p.setor ? `${p.area.nome} · ${p.setor.nome}` : p.area.nome} />
          <Meta rotulo="Tipo / origem" valor={`${p.tipo.nome} · ${p.origem.nome}`} />
          <Meta rotulo="Início estimado" valor={formatarData(p.data_inicio_estimado)} />
          <Meta rotulo="Fim estimado" valor={fimEstimado} />
        </View>
        <BarraProgresso valor={p.progresso} rotulo="Progresso do plano" />
      </View>

      {(p.objetivo || p.descricao_problema) && (
        <View style={estilos.bloco}>
          {p.descricao_problema && <Texto rotulo="Problema identificado" valor={p.descricao_problema} />}
          {p.objetivo && <Texto rotulo="Objetivo" valor={p.objetivo} />}
        </View>
      )}

      <View style={estilos.bloco}>
        <Text style={estilos.titulo} accessibilityRole="header">
          Ações {acoes.data ? `(${acoes.data.length})` : ""}
        </Text>
        {acoes.isLoading && <ActivityIndicator color={cores.primaria} />}
        {acoes.error && !acoes.data && <AvisoErro erro={acoes.error} onTentar={() => void acoes.refetch()} />}
        {acoes.data?.length === 0 && <Text style={estilos.apoio}>Nenhuma ação cadastrada.</Text>}
        {acoes.data?.map((a, i) => (
          <ItemAcao key={a.id} acao={a} primeiro={i === 0} onPress={() => router.push({ pathname: "/acoes/[id]", params: { id: String(a.id) } })} />
        ))}
      </View>
    </ScrollView>
  );
}

/** A lista já vem ordenada (1, 1.1, 1.2, 2…); subações ficam recuadas sob a ação principal. */
function ItemAcao({ acao, primeiro, onPress }: { acao: AcaoDoPlano; primeiro: boolean; onPress: () => void }) {
  // Status de execução, tag de prazo (prazo_tag) e condição do fluxo, cada um no seu selo.
  const selos = selosDaAcao(acao.status, acao.prazo_tag);
  const subacao = acao.acao_pai_id !== null;
  const aguardando = acao.aguardando.length > 0 && acaoEmAberto(acao.status);
  // Já iniciada e um pré-requisito foi reaberto: pede revisão em vez de "aguardando".
  const avisoPrereq = acao.revisar_prerequisito ? "Revisar: pré-requisito reaberto" : aguardando ? "Aguardando ação anterior" : null;
  const area = acao.setor ? `${acao.area.nome} · ${acao.setor.nome}` : acao.area.nome;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rotuloNumeroAcao(acao.numero)}: ${acao.descricao}. ${acao.responsavel.nome}. ${area}. Prazo de conclusão ${formatarData(acao.prazo)}. ${selos.map((x) => x.rotulo).join(". ")}${avisoPrereq ? `. ${avisoPrereq}` : ""}`}
      accessibilityHint="Abre o detalhe da ação"
      style={({ pressed }) => [estilos.item, subacao && estilos.itemSub, !primeiro && estilos.divisor, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[estilos.numero, subacao && { color: cores.violeta }]}>{rotuloNumeroAcao(acao.numero)}</Text>
        <Text style={estilos.descricao} numberOfLines={2}>
          {acao.descricao}
        </Text>
        <Text style={estilos.apoio} numberOfLines={1}>
          {acao.responsavel.nome} · {area}
        </Text>
        <Text style={estilos.apoio} numberOfLines={1}>
          Prazo de conclusão {formatarData(acao.prazo)}
        </Text>
        <View style={estilos.selos}>
          {selos.map((x) => (
            <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
          ))}
          {avisoPrereq && <Pilula texto={avisoPrereq} cor={cores.aviso} />}
        </View>
        <BarraProgresso valor={acao.progresso} />
      </View>
      <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
    </Pressable>
  );
}

function Meta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.meta}>
      <Text style={estilos.rotuloMeta}>{rotulo}</Text>
      <Text style={estilos.valorMeta}>{valor}</Text>
    </View>
  );
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={estilos.rotuloMeta}>{rotulo}</Text>
      <Text style={estilos.texto}>{valor}</Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], gap: espaco[4], paddingBottom: espaco[8] },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: espaco[2], padding: espaco[6], backgroundColor: cores.fundo },
  tituloVazio: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  nome: { fontSize: fonte.xl, fontWeight: "700", color: cores.texto, lineHeight: escalarTexto(28) },
  selos: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  faixaArquivado: { flexDirection: "row", alignItems: "center", gap: espaco[3], padding: espaco[3], borderRadius: raio.md, backgroundColor: cores.fundo2 },
  textoFaixa: { flex: 1, fontSize: fonte.base, color: cores.texto, lineHeight: escalarTexto(20) },
  caixa: { gap: espaco[2], padding: espaco[3], borderRadius: raio.md, backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: espaco[3] },
  rotuloMeta: { fontSize: fonte.sm, color: cores.textoSuave },
  valorMeta: { flexShrink: 1, fontSize: fonte.sm, fontWeight: "600", color: cores.texto, textAlign: "right" },
  bloco: { gap: espaco[3], padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  titulo: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  texto: { fontSize: fonte.base, color: cores.texto, lineHeight: escalarTexto(20) },
  apoio: { fontSize: fonte.sm, color: cores.textoSuave },
  item: { flexDirection: "row", alignItems: "center", gap: espaco[3], paddingVertical: espaco[3] },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  itemSub: { marginLeft: espaco[5] },
  numero: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, letterSpacing: 0.3, fontVariant: ["tabular-nums"] },
  descricao: { fontSize: fonte.base, fontWeight: "600", color: cores.texto },
}));
