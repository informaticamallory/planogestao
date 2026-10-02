import type { AcaoCalendario, DiaCalendarioResumo, SituacaoPrazo } from "@planogestao/shared-types";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from "react-native";

import { AvisoErro } from "../../components/AvisoErro";
import { BarraProgresso } from "../../components/BarraProgresso";
import { Icone } from "../../components/Icone";
import { Pilula } from "../../components/Pilula";
import { type Mes, somarMeses, useAcoesDoDia, useCalendarioMensal } from "../../hooks/useCalendario";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../theme";
import { formatarNumero, paraIsoData } from "../../utils/formatos";
import { SITUACAO, selosDaAcao, tagDaSituacao } from "../../utils/rotulos";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// Mesma ordem e cores das bolinhas do web (grade da Fase 8).
const SITUACOES: { chave: keyof DiaCalendarioResumo; situacao: SituacaoPrazo }[] = [
  { chave: "atrasadas", situacao: "atrasada" },
  { chave: "vencendo", situacao: "vencendo" },
  { chave: "em_andamento", situacao: "em_andamento" },
  { chave: "concluidas", situacao: "concluida" },
];

const mesDe = (d: Date): Mes => ({ ano: d.getFullYear(), mes: d.getMonth() + 1 });

type Secao = { dia: DiaCalendarioResumo; data: AcaoCalendario[] };

/**
 * Agenda: um mês por vez, só os dias com ações. Cada dia é uma seção do SectionList (virtualizado);
 * as ações existem só na seção do dia aberto e são buscadas ao abrir (GET /calendario/dia).
 */
export default function CalendarioScreen() {
  const router = useRouter();
  const hoje = paraIsoData(new Date());
  const [mes, setMes] = useState<Mes>(() => mesDe(new Date()));
  const [aberto, setAberto] = useState<string | null>(null);
  const [puxando, setPuxando] = useState(false);

  const mensal = useCalendarioMensal(mes);
  const doDia = useAcoesDoDia(aberto);
  // Enquanto o mês novo não chega, mostra o anterior esmaecido (sem piscar a lista).
  const trocando = mensal.isPlaceholderData;
  const dados = mensal.data;

  const mudarMes = (n: number) => {
    setAberto(null);
    setMes((m) => somarMeses(m, n));
  };
  const ehMesAtual = mes.ano === mesDe(new Date()).ano && mes.mes === mesDe(new Date()).mes;

  const alternar = useCallback((data: string) => setAberto((atual) => (atual === data ? null : data)), []);
  const abrirAcao = useCallback((id: number) => router.push({ pathname: "/acoes/[id]", params: { id: String(id) } }), [router]);

  const secoes = useMemo<Secao[]>(
    () => (dados?.dias ?? []).map((dia) => ({ dia, data: dia.data === aberto && doDia.data ? doDia.data : [] })),
    [dados, aberto, doDia.data],
  );

  const atualizar = useCallback(async () => {
    setPuxando(true);
    try {
      await Promise.all([mensal.refetch(), aberto ? doDia.refetch() : Promise.resolve()]);
    } finally {
      setPuxando(false);
    }
  }, [mensal, doDia, aberto]);

  return (
    <View style={estilos.tela}>
      <View style={estilos.seletor}>
        <BotaoSeta direcao="anterior" onPress={() => mudarMes(-1)} />
        <View style={estilos.centroSeletor} accessibilityLiveRegion="polite">
          <Text style={estilos.mes} accessibilityRole="header">
            {MESES[mes.mes - 1]} {mes.ano}
          </Text>
          <Text style={estilos.resumoMes}>
            {dados && !trocando ? `${formatarNumero(dados.total)} aç${dados.total === 1 ? "ão" : "ões"} em ${dados.dias.length} dia(s)` : "Carregando…"}
          </Text>
        </View>
        <BotaoSeta direcao="proximo" onPress={() => mudarMes(1)} />
      </View>
      {!ehMesAtual && (
        <Pressable onPress={() => { setAberto(null); setMes(mesDe(new Date())); }} style={estilos.voltarHoje} accessibilityRole="button" hitSlop={8}>
          <Text style={estilos.textoVoltarHoje}>Voltar para o mês atual</Text>
        </Pressable>
      )}

      <SectionList
        style={[{ flex: 1 }, trocando && { opacity: 0.5 }]}
        contentContainerStyle={estilos.conteudo}
        sections={secoes}
        keyExtractor={(a) => String(a.id)}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        windowSize={7}
        renderSectionHeader={({ section }) => (
          <CabecalhoDia
            dia={section.dia}
            ehHoje={section.dia.data === hoje}
            aberto={section.dia.data === aberto}
            carregando={section.dia.data === aberto && doDia.isLoading}
            onPress={alternar}
          />
        )}
        renderItem={({ item, index, section }) => (
          <ItemAcao acao={item} ultimo={index === section.data.length - 1} onPress={abrirAcao} />
        )}
        renderSectionFooter={({ section }) =>
          section.dia.data === aberto && doDia.error && !doDia.data ? (
            <View style={{ marginBottom: espaco[3] }}>
              <AvisoErro erro={doDia.error} onTentar={() => void doDia.refetch()} titulo="Não foi possível carregar as ações do dia" />
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
        ListHeaderComponent={mensal.error && !dados ? <AvisoErro erro={mensal.error} onTentar={() => void mensal.refetch()} /> : null}
        ListEmptyComponent={
          mensal.isLoading ? (
            <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} />
          ) : dados ? (
            <View style={estilos.vazio}>
              <Icone nome="calendar" tamanho={24} cor={cores.textoSutil} />
              <Text style={estilos.textoVazio}>Nenhuma ação com prazo neste mês.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function BotaoSeta({ direcao, onPress }: { direcao: "anterior" | "proximo"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={direcao === "anterior" ? "Mês anterior" : "Próximo mês"}
      hitSlop={8}
      style={({ pressed }) => [estilos.seta, pressed && { backgroundColor: cores.primariaSuave }]}
    >
      <View style={direcao === "anterior" ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Icone nome="chevronRight" tamanho={22} cor={cores.primaria} />
      </View>
    </Pressable>
  );
}

const CabecalhoDia = memo(function CabecalhoDia({
  dia,
  ehHoje,
  aberto,
  carregando,
  onPress,
}: {
  dia: DiaCalendarioResumo;
  ehHoje: boolean;
  aberto: boolean;
  carregando: boolean;
  onPress: (data: string) => void;
}) {
  const [ano, mes, d] = dia.data.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(ano!, mes! - 1, d!).getDay()];
  const contagens = SITUACOES.filter((s) => (dia[s.chave] as number) > 0);
  const descricao = contagens.map((s) => `${dia[s.chave]} ${SITUACAO[s.situacao].rotulo.toLowerCase()}`).join(", ");

  return (
    <Pressable
      onPress={() => onPress(dia.data)}
      accessibilityRole="button"
      accessibilityState={{ expanded: aberto }}
      accessibilityLabel={`${semana}, ${d}${ehHoje ? ", hoje" : ""}. ${dia.total} aç${dia.total === 1 ? "ão" : "ões"}: ${descricao}`}
      style={({ pressed }) => [estilos.dia, aberto && estilos.diaAberto, ehHoje && estilos.diaHoje, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={[estilos.data, ehHoje && { backgroundColor: cores.primaria }]}>
        <Text style={[estilos.numeroDia, ehHoje && { color: cores.primariaTexto }]}>{d}</Text>
        <Text style={[estilos.semana, ehHoje && { color: cores.primariaTexto }]}>{ehHoje ? "hoje" : semana}</Text>
      </View>
      <View style={estilos.bolinhas}>
        {contagens.map((s) => (
          <View key={s.situacao} style={estilos.bolinha}>
            <View style={[estilos.ponto, { backgroundColor: SITUACAO[s.situacao].cor }]} />
            <Text style={[estilos.numBolinha, { color: SITUACAO[s.situacao].cor }]}>{dia[s.chave] as number}</Text>
          </View>
        ))}
      </View>
      <Text style={estilos.total}>{dia.total}</Text>
      {carregando ? (
        <ActivityIndicator color={cores.primaria} />
      ) : (
        <View style={{ transform: [{ rotate: aberto ? "90deg" : "0deg" }] }}>
          <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
        </View>
      )}
    </Pressable>
  );
});

const ItemAcao = memo(function ItemAcao({ acao, ultimo, onPress }: { acao: AcaoCalendario; ultimo: boolean; onPress: (id: number) => void }) {
  // Status de execução e tag de prazo à parte (a API só manda a situação; concluída não tem tag).
  const selos = selosDaAcao(acao.status, tagDaSituacao(acao.situacao));
  return (
    <Pressable
      onPress={() => onPress(acao.id)}
      accessibilityRole="button"
      accessibilityLabel={`${acao.descricao}. Plano ${acao.plano.codigo}. ${acao.responsavel.nome}. ${selos.map((x) => x.rotulo).join(". ")}. Progresso ${acao.progresso}%`}
      accessibilityHint="Abre o detalhe da ação"
      style={({ pressed }) => [estilos.acao, ultimo && estilos.acaoUltima, pressed && { backgroundColor: cores.fundo2 }]}
    >
      <View style={[estilos.faixa, { backgroundColor: SITUACAO[acao.situacao].cor }]} />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={estilos.topoAcao}>
          <Text style={estilos.codigo}>{acao.plano.codigo}</Text>
          <View style={estilos.selos}>
            {selos.map((x) => (
              <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
            ))}
          </View>
        </View>
        <Text style={estilos.descricao} numberOfLines={2}>
          {acao.descricao}
        </Text>
        <Text style={estilos.responsavel} numberOfLines={1}>
          {acao.responsavel.nome}
        </Text>
        <BarraProgresso valor={acao.progresso} />
      </View>
      <Icone nome="chevronRight" tamanho={18} cor={cores.textoSutil} />
    </Pressable>
  );
});

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  seletor: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    paddingHorizontal: espaco[4],
    paddingVertical: espaco[3],
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  seta: { width: 48, height: 48, borderRadius: raio.md, borderWidth: 1.5, borderColor: cores.borda, alignItems: "center", justifyContent: "center" },
  centroSeletor: { flex: 1, alignItems: "center", gap: 2 },
  mes: { fontSize: fonte.lg, fontWeight: "700", color: cores.texto },
  resumoMes: { fontSize: fonte.sm, color: cores.textoSuave },
  voltarHoje: { alignSelf: "center", paddingVertical: espaco[2] },
  textoVoltarHoje: { fontSize: fonte.sm, fontWeight: "700", color: cores.primaria, textDecorationLine: "underline" },
  conteudo: { padding: espaco[4], paddingBottom: espaco[8] },
  dia: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    minHeight: 64,
    paddingHorizontal: espaco[3],
    paddingVertical: espaco[2],
    marginBottom: espaco[2],
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    backgroundColor: cores.superficie,
  },
  diaAberto: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: cores.primaria },
  diaHoje: { borderColor: cores.primaria, borderWidth: 1.5 },
  // Número + dia da semana: a caixa cresce com o tamanho do texto.
  data: { width: escalarTexto(48), height: escalarTexto(48), borderRadius: raio.md, alignItems: "center", justifyContent: "center", backgroundColor: cores.fundo2 },
  numeroDia: { fontSize: fonte.lg, fontWeight: "800", color: cores.texto, fontVariant: ["tabular-nums"] },
  semana: { fontSize: fonte.xs, fontWeight: "600", color: cores.textoSuave },
  bolinhas: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: espaco[3] },
  bolinha: { flexDirection: "row", alignItems: "center", gap: 4 },
  ponto: { width: 10, height: 10, borderRadius: 5 },
  numBolinha: { fontSize: fonte.sm, fontWeight: "700", fontVariant: ["tabular-nums"] },
  total: { minWidth: 28, textAlign: "right", fontSize: fonte.md, fontWeight: "800", color: cores.texto, fontVariant: ["tabular-nums"] },
  acao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco[3],
    padding: espaco[3],
    backgroundColor: cores.superficie,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: cores.primaria,
  },
  acaoUltima: { marginBottom: espaco[2], borderBottomLeftRadius: raio.lg, borderBottomRightRadius: raio.lg },
  faixa: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  topoAcao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[2] },
  selos: { flexShrink: 1, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: espaco[1] },
  codigo: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, fontVariant: ["tabular-nums"] },
  descricao: { fontSize: fonte.base, fontWeight: "600", color: cores.texto },
  responsavel: { fontSize: fonte.xs, color: cores.textoSuave },
  vazio: { alignItems: "center", gap: espaco[2], paddingVertical: espaco[8] },
  textoVazio: { fontSize: fonte.base, color: cores.textoSuave, textAlign: "center" },
}));
