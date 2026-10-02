import { ApiError } from "@planogestao/api-client";
import type { AcaoDetalhe, RefAcao, SubacaoItem } from "@planogestao/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { AvisoErro } from "../../components/AvisoErro";
import { BarraProgresso } from "../../components/BarraProgresso";
import { Icone } from "../../components/Icone";
import { Pilula } from "../../components/Pilula";
import { BlocoExecucao } from "../../components/acao/Execucao";
import { BlocoAceite, BlocoRespostaSolicitacao, estilos as e } from "../../components/acao/FluxoPrazo";
import { ListaSolicitacoes, TimelineAcao } from "../../components/acao/Historico";
import { useAcaoDetalhe } from "../../hooks/useAcao";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarData, formatarDataHora } from "../../utils/formatos";
import { ROTULO_PRIORIDADE, acaoEmAberto, rotuloNumeroAcao, selosDaAcao, textoStatusAcao } from "../../utils/rotulos";

/** "Ação 2 — descrição" (ou "Sub-item 2.1 — …"). */
const nomeRef = (r: RefAcao) => `${rotuloNumeroAcao(r.numero)} — ${r.descricao}`;

/** Período estimado de um sub-item: "01/10/2026 → 15/10/2026" (sem início estimado em ações antigas). */
const periodo = (s: SubacaoItem) => (s.prazo_inicio ? `${formatarData(s.prazo_inicio)} → ${formatarData(s.prazo)}` : `até ${formatarData(s.prazo)}`);

function descreverPrazo(a: AcaoDetalhe): string {
  const data = formatarData(a.prazo);
  if (a.status === "concluida" || a.status === "cancelada" || a.status === "recusada") return data;
  if (a.dias_para_prazo < 0) return `${data} · vencido há ${-a.dias_para_prazo} dia(s)`;
  if (a.dias_para_prazo === 0) return `${data} · vence hoje`;
  return `${data} · faltam ${a.dias_para_prazo} dia(s)`;
}

export default function DetalheAcaoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const acaoId = Number(id);
  const queryClient = useQueryClient();
  const { data: acao, error, refetch } = useAcaoDetalhe(acaoId);
  const [puxando, setPuxando] = useState(false);

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["acao", acaoId, "historico"] })]);
    } finally {
      setPuxando(false);
    }
  }, [refetch, queryClient, acaoId]);

  const titulo = <Stack.Screen options={{ title: acao ? acao.plano.codigo : "Ação" }} />;

  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return (
      <View style={estilos.centro}>
        {titulo}
        <Icone nome="alert" tamanho={28} cor={cores.textoSutil} />
        <Text style={estilos.tituloVazio}>Ação não encontrada</Text>
        <Text style={estilos.textoVazio}>A ação não existe ou você não tem acesso a ela.</Text>
      </View>
    );
  }
  if (error && !acao) {
    return (
      <View style={[estilos.tela, { padding: espaco[4] }]}>
        {titulo}
        <AvisoErro erro={error} onTentar={() => void refetch()} titulo="Não foi possível carregar a ação" />
      </View>
    );
  }
  if (!acao) {
    return (
      <View style={estilos.centro}>
        {titulo}
        <ActivityIndicator color={cores.primaria} size="large" />
      </View>
    );
  }

  const p = acao.permissoes;
  // Status de execução, tag de prazo (prazo_tag) e condição do fluxo, cada um no seu selo.
  const selos = selosDaAcao(acao.status, acao.prazo_tag);
  const mostrarAceite = p.eh_responsavel && acao.status === "aguardando_aceite";
  // Aguardando aceite, a execução ainda não começou: só o gestor vê (ajustar prazo ou cancelar) — igual ao web.
  const mostrarExecucao = acao.status !== "aguardando_aceite" || p.editar_prazo;
  const aguardandoAnterior = acao.aguardando.length > 0 && acaoEmAberto(acao.status);
  // Já iniciada, mas um pré-requisito voltou a ficar em aberto (ex.: reaberto): pede revisão.
  const revisar = acao.revisar_prerequisito;
  const abrirAcao = (id: number) => router.push({ pathname: "/acoes/[id]", params: { id: String(id) } });
  const origem = acao.acao_origem;
  const textoPlano = `${acao.plano.codigo} · ${acao.plano.nome}`;

  return (
    <ScrollView
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
    >
      {titulo}
      <View style={estilos.cabecalho}>
        {/* O responsável por uma subação pode não ter acesso ao plano: aí o código aparece sem link. */}
        {acao.plano_visivel ? (
          <Pressable
            onPress={() => router.push({ pathname: "/planos/[id]", params: { id: String(acao.plano.id) } })}
            accessibilityRole="link"
            accessibilityHint="Abre o plano"
            hitSlop={8}
            style={estilos.linkPlano}
          >
            <Text style={estilos.plano} numberOfLines={2}>
              {textoPlano}
            </Text>
            <Icone nome="chevronRight" tamanho={14} cor={cores.primaria} />
          </Pressable>
        ) : (
          <Text style={[estilos.plano, { color: cores.textoSuave }]} numberOfLines={2}>
            {textoPlano}
          </Text>
        )}
        {origem &&
          (acao.acao_origem_acessivel ? (
            <Pressable onPress={() => abrirAcao(origem.id)} accessibilityRole="link" accessibilityHint="Abre a ação de origem" hitSlop={8} style={estilos.linkPlano}>
              <Text style={estilos.plano} numberOfLines={2}>
                Ação de origem: {nomeRef(origem)}
              </Text>
              <Icone nome="chevronRight" tamanho={14} cor={cores.primaria} />
            </Pressable>
          ) : (
            <Text style={estilos.origem} numberOfLines={2}>
              Ação de origem: {nomeRef(origem)}
            </Text>
          ))}
        <View style={{ gap: 2 }}>
          <Text style={estilos.numero}>{rotuloNumeroAcao(acao.numero)}</Text>
          <Text style={estilos.descricao} accessibilityRole="header">
            {acao.descricao}
          </Text>
        </View>
        <View style={estilos.selos}>
          {selos.map((x) => (
            <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
          ))}
          {revisar ? (
            <Pilula texto="Revisar: pré-requisito reaberto" cor={cores.aviso} />
          ) : (
            aguardandoAnterior && <Pilula texto="Aguardando ação anterior" cor={cores.aviso} />
          )}
          <Pilula texto={ROTULO_PRIORIDADE[acao.prioridade]} cor={cores.textoSuave} />
        </View>
        <View style={estilos.metadados}>
          <Meta rotulo="Responsável" valor={acao.responsavel.nome} />
          <Meta rotulo="Área" valor={acao.area.nome} />
          {acao.setor && <Meta rotulo="Setor" valor={acao.setor.nome} />}
          <Meta rotulo="Início estimado" valor={acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "—"} />
          <Meta rotulo="Prazo de conclusão" valor={descreverPrazo(acao)} />
          <Meta rotulo="Início real" valor={acao.iniciada_em ? formatarDataHora(acao.iniciada_em) : "—"} />
          {acao.concluida_em && <Meta rotulo="Conclusão real" valor={formatarDataHora(acao.concluida_em)} />}
          <Meta rotulo="Fim estimado do plano" valor={formatarData(acao.plano.data_fim_estimado)} />
        </View>
        <BarraProgresso valor={acao.progresso} rotulo="Progresso da ação" />
      </View>

      {(aguardandoAnterior || revisar) && (
        <View style={estilos.faixaAguardando} accessibilityRole="alert">
          <View style={estilos.linhaIcone}>
            <Icone nome={revisar ? "alert" : "clock"} tamanho={18} cor={cores.aviso} />
            <Text style={estilos.tituloAguardando}>{revisar ? "Revisar: pré-requisito reaberto" : "Aguardando ação anterior"}</Text>
          </View>
          <Text style={estilos.textoFaixa}>
            {revisar
              ? `Esta ação já foi iniciada, mas ${acao.aguardando.length > 1 ? "pré-requisitos voltaram" : "um pré-requisito voltou"} a ficar em aberto. Confira se o andamento continua válido${acao.aguardando.length ? ":" : "."}`
              : `Esta ação pode ser aceita e editada, mas só pode ser iniciada depois que ${acao.aguardando.length === 1 ? "esta ação for concluída" : "estas ações forem concluídas"}:`}
          </Text>
          {acao.aguardando.map((r) => (
            <Text key={r.id} style={estilos.itemAguardando}>
              • {nomeRef(r)} ({textoStatusAcao(r.status)})
            </Text>
          ))}
        </View>
      )}

      {acao.status === "cancelada" && acao.motivo_cancelamento && (
        <View style={[estilos.faixa, { backgroundColor: cores.fundo2 }]} accessibilityRole="text">
          <Icone nome="alert" tamanho={18} cor={cores.textoSuave} />
          <Text style={estilos.textoFaixa}>Cancelada: {acao.motivo_cancelamento}</Text>
        </View>
      )}

      {mostrarAceite && <BlocoAceite acao={acao} />}
      {p.responder_solicitacao && <BlocoRespostaSolicitacao acao={acao} />}
      {!mostrarAceite && p.eh_responsavel && acao.solicitacao_pendente && (
        <View style={estilos.faixa} accessibilityRole="text">
          <Icone nome="clock" tamanho={18} cor={cores.info} />
          <Text style={estilos.textoFaixa}>
            Sua solicitação para mudar o prazo para {formatarData(acao.solicitacao_pendente.novo_prazo_sugerido)} aguarda resposta do gestor.
          </Text>
        </View>
      )}

      {mostrarExecucao && <BlocoExecucao acao={acao} />}

      {/* Sub-itens: somente leitura no app (a criação fica no web). */}
      {acao.subacoes.length > 0 && (
        <View style={e.bloco}>
          <Text style={e.titulo} accessibilityRole="header">
            Sub-itens ({acao.subacoes.length})
          </Text>
          {acao.subacoes_pendentes > 0 && (
            <Text style={estilos.aviso}>
              {acao.subacoes_pendentes === 1 ? "Há 1 sub-item em aberto" : `Há ${acao.subacoes_pendentes} sub-itens em aberto`}: esta ação só pode ser concluída
              depois que {acao.subacoes_pendentes === 1 ? "ele for encerrado" : "eles forem encerrados"}.
            </Text>
          )}
          {acao.subacoes.map((sub, i) => (
            <ItemSubacao key={sub.id} subacao={sub} primeiro={i === 0} onPress={() => abrirAcao(sub.id)} />
          ))}
        </View>
      )}

      {acao.depende_de.length > 0 && (
        <View style={e.bloco}>
          <Text style={e.titulo} accessibilityRole="header">
            Pré-requisitos
          </Text>
          <Text style={e.apoio}>Ações que precisam estar concluídas para esta poder ser iniciada.</Text>
          {acao.depende_de.map((r) => (
            <View key={r.id} style={estilos.linhaRef}>
              <Text style={estilos.textoRef}>{nomeRef(r)}</Text>
              {/* RefAcao não traz prazo: só status e condição. */}
              <View style={estilos.selos}>
                {selosDaAcao(r.status, null).map((x) => (
                  <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <ListaSolicitacoes acao={acao} />
      <TimelineAcao acaoId={acao.id} />

      <Text style={estilos.rodape}>
        Criada em {formatarDataHora(acao.criado_em)}
        {acao.criado_por && ` por ${acao.criado_por.nome}`}
        {acao.aceita_em && ` · aceita em ${formatarDataHora(acao.aceita_em)}`}
      </Text>
    </ScrollView>
  );
}

function ItemSubacao({ subacao, primeiro, onPress }: { subacao: SubacaoItem; primeiro: boolean; onPress: () => void }) {
  const selos = selosDaAcao(subacao.status, subacao.prazo_tag);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sub-item ${subacao.numero}: ${subacao.descricao}. ${subacao.responsavel.nome}. ${periodo(subacao)}. ${selos.map((x) => x.rotulo).join(". ")}`}
      accessibilityHint="Abre o detalhe do sub-item"
      style={({ pressed }) => [estilos.itemSub, !primeiro && estilos.divisor, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={estilos.numero}>{rotuloNumeroAcao(subacao.numero)}</Text>
        <Text style={estilos.textoRef} numberOfLines={2}>
          {subacao.descricao}
        </Text>
        <Text style={e.apoio} numberOfLines={2}>
          {subacao.responsavel.nome} · {periodo(subacao)}
        </Text>
        <View style={estilos.selos}>
          {selos.map((x) => (
            <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
          ))}
        </View>
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

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco[4], gap: espaco[4], paddingBottom: espaco[8] },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: espaco[2], padding: espaco[6], backgroundColor: cores.fundo },
  tituloVazio: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  textoVazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center" },
  cabecalho: { gap: espaco[3] },
  linkPlano: { flexDirection: "row", alignItems: "center", gap: 4 },
  plano: { flexShrink: 1, fontSize: fonte.sm, fontWeight: "600", color: cores.primariaSuaveTexto },
  origem: { fontSize: fonte.sm, fontWeight: "600", color: cores.textoSuave },
  numero: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, letterSpacing: 0.3, fontVariant: ["tabular-nums"] },
  descricao: { fontSize: fonte.xl, fontWeight: "700", color: cores.texto, lineHeight: escalarTexto(28) },
  selos: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  metadados: { gap: espaco[2], padding: espaco[3], borderRadius: raio.md, backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: espaco[3] },
  rotuloMeta: { fontSize: fonte.sm, color: cores.textoSuave },
  valorMeta: { flexShrink: 1, fontSize: fonte.sm, fontWeight: "600", color: cores.texto, textAlign: "right" },
  faixa: { flexDirection: "row", alignItems: "center", gap: espaco[3], padding: espaco[3], borderRadius: raio.md, backgroundColor: cores.infoSuave },
  textoFaixa: { flex: 1, fontSize: fonte.base, color: cores.texto, lineHeight: escalarTexto(20) },
  faixaAguardando: { gap: espaco[2], padding: espaco[3], borderRadius: raio.md, borderWidth: 1.5, borderColor: cores.aviso, backgroundColor: cores.avisoSuave },
  linhaIcone: { flexDirection: "row", alignItems: "center", gap: espaco[2] },
  tituloAguardando: { fontSize: fonte.md, fontWeight: "700", color: cores.aviso },
  itemAguardando: { fontSize: fonte.base, fontWeight: "600", color: cores.texto, lineHeight: escalarTexto(20) },
  aviso: { fontSize: fonte.sm, color: cores.aviso, backgroundColor: cores.avisoSuave, padding: espaco[3], borderRadius: raio.sm, lineHeight: escalarTexto(18) },
  linhaRef: { gap: 4 },
  textoRef: { fontSize: fonte.base, fontWeight: "600", color: cores.texto },
  itemSub: { flexDirection: "row", alignItems: "center", gap: espaco[3], paddingVertical: espaco[3] },
  divisor: { borderTopWidth: 1, borderTopColor: cores.borda },
  rodape: { fontSize: fonte.xs, color: cores.textoSutil, textAlign: "center" },
}));
