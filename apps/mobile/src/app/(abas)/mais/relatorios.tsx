import type { ConsultaRelatorioAcoes, ConsultaRelatorioPlanos } from "@planogestao/api-client";
import type {
  FiltroArquivados,
  LinhaRelatorioAcao,
  PlanoListaItem,
  Prioridade,
  SituacaoPrazo,
  StatusAcao,
  StatusFiltroPlano,
  TagPrazo,
  TipoPeriodo,
} from "@planogestao/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BarraProgresso } from "../../../components/BarraProgresso";
import { CampoData } from "../../../components/Campos";
import { ChipsMultiplo, ChipsUnico, Escolha } from "../../../components/Escolhas";
import { Pilula } from "../../../components/Pilula";
import { comPeriodoValido, type Filtros, TelaRelatorio } from "../../../components/relatorios/TelaRelatorio";
import { useOpcoesPlanos } from "../../../hooks/usePlanos";
import { api } from "../../../services/api";
import { temPermissao, useAuthStore } from "../../../store/authStore";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../theme";
import { formatarData } from "../../../utils/formatos";
import {
  ROTULO_PERIODO,
  ROTULO_PRAZO,
  ROTULO_STATUS_PLANO,
  SITUACAO,
  acaoEmAberto,
  selosDaAcao,
  statusDoPlano,
  tagDaSituacao,
  tagDePrazo,
} from "../../../utils/rotulos";

// Mesmas opções, na mesma ordem, dos filtros do web (RelatorioPlanos.tsx / RelatorioAcoes.tsx).
const PERIODOS = (Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => ({ valor: p, rotulo: ROTULO_PERIODO[p] }));
const STATUS_PLANO = (["nao_iniciado", "em_andamento", "concluido"] as StatusFiltroPlano[]).map((s) => ({ valor: s, rotulo: ROTULO_STATUS_PLANO[s] }));
// Situação do prazo do fim estimado, independente do status.
const PRAZOS = (["em_atraso", "a_vencer", "no_prazo", "sem_prazo"] as TagPrazo[]).map((t) => ({ valor: t, rotulo: ROTULO_PRAZO[t] }));
// Sem escolha = só ativos (padrão do backend, arquivados=excluir).
const EXIBICOES: { valor: FiltroArquivados; rotulo: string }[] = [
  { valor: "somente", rotulo: "Arquivados" },
  { valor: "incluir", rotulo: "Todos" },
];
const NOME_PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const PRIORIDADES = (Object.keys(NOME_PRIORIDADE) as Prioridade[]).map((p) => ({ valor: p, rotulo: NOME_PRIORIDADE[p] }));
const ORDENACOES = [
  { valor: "codigo", rotulo: "Código" },
  { valor: "nome", rotulo: "Nome" },
  { valor: "data_inicio_estimado", rotulo: "Início estimado" },
  { valor: "data_fim_estimado", rotulo: "Fim estimado" },
  { valor: "prioridade", rotulo: "Prioridade" },
  { valor: "progresso", rotulo: "Progresso" },
  { valor: "area", rotulo: "Área" },
  { valor: "responsavel", rotulo: "Responsável" },
];
// Status de execução (3) + descartes. A API filtra pelos status do fluxo: cada opção vira o seu grupo.
const GRUPOS_STATUS_ACAO: { valor: string; rotulo: string; status: StatusAcao[] }[] = [
  { valor: "nao_iniciado", rotulo: "Não iniciado", status: ["aguardando_aceite", "aceita"] },
  { valor: "em_andamento", rotulo: "Em andamento", status: ["em_andamento", "bloqueada"] },
  { valor: "concluido", rotulo: "Concluído", status: ["concluida"] },
  { valor: "cancelada", rotulo: "Cancelada", status: ["cancelada"] },
  { valor: "recusada", rotulo: "Recusada", status: ["recusada"] },
];
const STATUS_ACAO = GRUPOS_STATUS_ACAO.map(({ valor, rotulo }) => ({ valor, rotulo }));
const SITUACOES = (["atrasada", "vencendo", "em_andamento", "concluida"] as SituacaoPrazo[]).map((s) => ({ valor: s, rotulo: SITUACAO[s].rotulo }));

type ConsultaPlanos = Omit<ConsultaRelatorioPlanos, "page" | "page_size">;
type ConsultaAcoes = Omit<ConsultaRelatorioAcoes, "page" | "page_size">;
const consultaPlanos = (f: Filtros) => comPeriodoValido<ConsultaPlanos>(f);
const consultaAcoes = (f: Filtros) =>
  comPeriodoValido<ConsultaAcoes>({
    ...f,
    status: GRUPOS_STATUS_ACAO.filter((g) => lista(f.status).includes(g.valor)).flatMap((g) => g.status),
  });
const lista = (v: Filtros[string]) => (Array.isArray(v) ? v : []);
const num = (v: Filtros[string]) => (typeof v === "number" ? v : undefined);
const txt = (v: Filtros[string]) => (typeof v === "string" ? v : undefined);

export default function RelatoriosScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const [aba, setAba] = useState<"planos" | "acoes">("planos");
  if (!temPermissao(usuario, "relatorios:ver")) return <Redirect href="/mais" />;

  return (
    <View style={estilos.tela}>
      <View style={estilos.segmentos} accessibilityRole="tablist">
        {[
          { v: "planos" as const, t: "Relatório de Planos" },
          { v: "acoes" as const, t: "Relatório de Ações" },
        ].map((o) => (
          <Pressable
            key={o.v}
            onPress={() => setAba(o.v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === o.v }}
            style={[estilos.segmento, aba === o.v && estilos.segmentoAtivo]}
          >
            <Text style={[estilos.textoSegmento, aba === o.v && { color: cores.texto }]}>{o.t}</Text>
          </Pressable>
        ))}
      </View>
      {/* As duas ficam montadas: trocar de aba não perde filtros nem o relatório gerado. */}
      <View style={[{ flex: 1 }, aba !== "planos" && estilos.oculto]}>
        <RelatorioPlanos />
      </View>
      <View style={[{ flex: 1 }, aba !== "acoes" && estilos.oculto]}>
        <RelatorioAcoes />
      </View>
    </View>
  );
}

function RelatorioPlanos() {
  const router = useRouter();
  const opcoes = useOpcoesPlanos();
  return (
    <TelaRelatorio<PlanoListaItem>
      id="planos"
      titulo="Relatório de Planos"
      nomeArquivo="planos"
      consultar={(f, page, page_size) => api.relatorios.planos({ ...consultaPlanos(f), page, page_size })}
      urlExportacao={(f, formato) => api.relatorios.urlExportacaoPlanos(consultaPlanos(f), formato)}
      exportarPelaApi={(f, formato) => api.relatorios.exportarPlanos(consultaPlanos(f), formato)}
      renderFiltros={(r, alterar) => {
        const setores = (opcoes.data?.setores ?? []).filter((s) => !r.area_id || s.area_id === r.area_id);
        return (
          <>
            <ChipsUnico rotulo="Criados no período" vazio="Qualquer data" valor={txt(r.periodo) as TipoPeriodo | undefined} opcoes={PERIODOS} onEscolher={(v) => alterar({ periodo: v })} />
            {r.periodo === "personalizado" && <Datas r={r} alterar={alterar} de="data_inicio" ate="data_fim" />}
            <Escolha rotulo="Área" todos="Todas" valor={num(r.area_id)} opcoes={opcoes.data?.areas ?? []} onEscolher={(v) => alterar({ area_id: v, setor_id: undefined })} />
            <Escolha rotulo="Setor" todos="Todos" valor={num(r.setor_id)} opcoes={setores} onEscolher={(v) => alterar({ setor_id: v })} />
            <Escolha rotulo="Responsável" todos="Todos" valor={num(r.responsavel_id)} opcoes={opcoes.data?.responsaveis ?? []} onEscolher={(v) => alterar({ responsavel_id: v })} />
            <Escolha rotulo="Tipo" todos="Todos" valor={num(r.tipo_id)} opcoes={opcoes.data?.tipos ?? []} onEscolher={(v) => alterar({ tipo_id: v })} />
            <Escolha rotulo="Origem" todos="Todas" valor={num(r.origem_id)} opcoes={opcoes.data?.origens ?? []} onEscolher={(v) => alterar({ origem_id: v })} />
            <ChipsUnico rotulo="Exibição" vazio="Ativos" valor={txt(r.arquivados) as FiltroArquivados | undefined} opcoes={EXIBICOES} onEscolher={(v) => alterar({ arquivados: v })} />
            <ChipsMultiplo rotulo="Status" valores={lista(r.status) as StatusFiltroPlano[]} opcoes={STATUS_PLANO} onAlterar={(v) => alterar({ status: v })} />
            <ChipsMultiplo rotulo="Situação do prazo" valores={lista(r.prazo) as TagPrazo[]} opcoes={PRAZOS} onAlterar={(v) => alterar({ prazo: v })} />
            <ChipsMultiplo rotulo="Prioridade" valores={lista(r.prioridade) as Prioridade[]} opcoes={PRIORIDADES} onAlterar={(v) => alterar({ prioridade: v })} />
            <ChipsUnico
              rotulo="Ordenar por"
              vazio="Mais recentes"
              valor={txt(r.ordenar)}
              opcoes={ORDENACOES}
              onEscolher={(v) => alterar({ ordenar: v, direcao: v ? "asc" : undefined })}
            />
          </>
        );
      }}
      renderItem={(p) => {
        const s = statusDoPlano(p.status);
        const t = p.prazo_tag ? tagDePrazo(p.prazo_tag) : null;
        const extras = [t?.rotulo, p.rascunho && "Rascunho", p.arquivado && "Arquivado"].filter(Boolean).join(". ");
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/planos/[id]", params: { id: String(p.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${p.codigo}, ${p.nome}. ${s.rotulo}.${extras ? ` ${extras}.` : ""} Fim estimado ${formatarData(p.data_fim_estimado)}. Progresso ${p.progresso}%`}
            style={({ pressed }) => [estilos.cartao, pressed && { backgroundColor: cores.fundo2 }]}
          >
            <View style={estilos.topo}>
              <Text style={estilos.codigo}>{p.codigo}</Text>
              {p.arquivado && <Pilula texto="Arquivado" cor={cores.textoSuave} />}
            </View>
            {/* Status e prazo são independentes: um plano pode estar "Em andamento" e "Em atraso". */}
            <View style={estilos.selos}>
              <Pilula texto={s.rotulo} cor={s.cor} />
              {t && <Pilula texto={t.rotulo} cor={t.cor} />}
              {p.rascunho && <Pilula texto="Rascunho" cor={cores.textoSuave} />}
            </View>
            <Text style={estilos.titulo} numberOfLines={2}>
              {p.nome}
            </Text>
            <Campo rotulo="Responsável" valor={p.responsavel.nome} />
            <Campo rotulo="Área / Setor" valor={p.setor ? `${p.area.nome} / ${p.setor.nome}` : p.area.nome} />
            <Campo rotulo="Tipo · Origem" valor={`${p.tipo.nome} · ${p.origem.nome}`} />
            <Campo rotulo="Início → fim estimado" valor={`${formatarData(p.data_inicio_estimado)} → ${formatarData(p.data_fim_estimado)}`} />
            <Campo rotulo="Prioridade" valor={NOME_PRIORIDADE[p.prioridade]} />
            <BarraProgresso valor={p.progresso} />
            <Text style={estilos.rodape}>
              {p.acoes_concluidas}/{p.total_acoes} ações concluídas
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function RelatorioAcoes() {
  const router = useRouter();
  const opcoes = useOpcoesPlanos();
  // Mesma lista de planos do filtro "Plano" no web (visíveis ao usuário, pelo código, incluindo arquivados).
  const planos = useQuery({
    queryKey: ["planos", "opcoes-relatorio"],
    queryFn: () => api.planos.listar({ page_size: 100, ordenar: "codigo", direcao: "asc", arquivados: "incluir" }),
    staleTime: 60_000,
  });
  return (
    <TelaRelatorio<LinhaRelatorioAcao>
      id="acoes"
      titulo="Relatório de Ações"
      nomeArquivo="acoes"
      consultar={(f, page, page_size) => api.relatorios.acoes({ ...consultaAcoes(f), page, page_size })}
      urlExportacao={(f, formato) => api.relatorios.urlExportacaoAcoes(consultaAcoes(f), formato)}
      exportarPelaApi={(f, formato) => api.relatorios.exportarAcoes(consultaAcoes(f), formato)}
      renderFiltros={(r, alterar) => (
        <>
          <Escolha rotulo="Responsável" todos="Todos" valor={num(r.responsavel_id)} opcoes={opcoes.data?.responsaveis ?? []} onEscolher={(v) => alterar({ responsavel_id: v })} />
          <Escolha
            rotulo="Plano"
            todos="Todos"
            valor={num(r.plano_id)}
            opcoes={(planos.data?.items ?? []).map((p) => ({ id: p.id, nome: `${p.codigo} — ${p.nome}` }))}
            onEscolher={(v) => alterar({ plano_id: v })}
          />
          <Datas r={r} alterar={alterar} de="prazo_de" ate="prazo_ate" rotuloDe="Prazo de" rotuloAte="Prazo até" />
          <ChipsUnico rotulo="Criadas no período" vazio="Qualquer data" valor={txt(r.periodo) as TipoPeriodo | undefined} opcoes={PERIODOS} onEscolher={(v) => alterar({ periodo: v })} />
          {r.periodo === "personalizado" && <Datas r={r} alterar={alterar} de="data_inicio" ate="data_fim" />}
          <ChipsMultiplo rotulo="Situação" valores={lista(r.situacao) as SituacaoPrazo[]} opcoes={SITUACOES} onAlterar={(v) => alterar({ situacao: v })} />
          <ChipsMultiplo rotulo="Status" valores={lista(r.status)} opcoes={STATUS_ACAO} onAlterar={(v) => alterar({ status: v })} />
        </>
      )}
      renderItem={(a) => {
        // Status de execução e tag de prazo à parte (a API só manda a situação; concluída não tem tag).
        const tag = tagDaSituacao(a.situacao);
        const selos = selosDaAcao(a.status, tag);
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/acoes/[id]", params: { id: String(a.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${a.descricao}. Plano ${a.plano.codigo}. ${a.responsavel}. Prazo de conclusão ${formatarData(a.prazo)}. ${selos.map((x) => x.rotulo).join(". ")}`}
            style={({ pressed }) => [estilos.cartao, pressed && { backgroundColor: cores.fundo2 }]}
          >
            <View style={estilos.topo}>
              <Text style={estilos.codigo}>{a.plano.codigo}</Text>
              <View style={[estilos.selos, estilos.selosTopo]}>
                {selos.map((x) => (
                  <Pilula key={x.rotulo} texto={x.rotulo} cor={x.cor} />
                ))}
              </View>
            </View>
            <Text style={estilos.titulo} numberOfLines={3}>
              {a.descricao}
            </Text>
            <Campo rotulo="Responsável" valor={a.responsavel} />
            <Campo rotulo="Prazo de conclusão · Prioridade" valor={`${formatarData(a.prazo)} · ${NOME_PRIORIDADE[a.prioridade as Prioridade] ?? a.prioridade}`} />
            <Campo rotulo="Situação do prazo" valor={tag && acaoEmAberto(a.status) ? ROTULO_PRAZO[tag] : "—"} />
            {a.no_prazo !== null && <Campo rotulo="Entregue no prazo?" valor={a.no_prazo ? "Sim" : "Não"} />}
            <BarraProgresso valor={a.progresso} />
          </Pressable>
        );
      }}
    />
  );
}

function Datas({
  r,
  alterar,
  de,
  ate,
  rotuloDe = "De",
  rotuloAte = "Até",
}: {
  r: Filtros;
  alterar: (p: Filtros) => void;
  de: string;
  ate: string;
  rotuloDe?: string;
  rotuloAte?: string;
}) {
  const vDe = txt(r[de]);
  const vAte = txt(r[ate]);
  return (
    <View style={estilos.linhaDatas}>
      <View style={{ flex: 1 }}>
        <CampoData rotulo={rotuloDe} valor={vDe ?? null} onAlterar={(v) => alterar({ [de]: v })} />
      </View>
      <View style={{ flex: 1 }}>
        <CampoData rotulo={rotuloAte} valor={vAte ?? null} minimo={vDe} onAlterar={(v) => alterar({ [ate]: v })} erro={vDe && vAte && vAte < vDe ? "Antes do início." : null} />
      </View>
    </View>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotuloCampo}>{rotulo}</Text>
      <Text style={estilos.valorCampo} numberOfLines={2}>
        {valor}
      </Text>
    </View>
  );
}

const estilos = estilosDinamicos(() => ({
  tela: { flex: 1, backgroundColor: cores.fundo },
  segmentos: { flexDirection: "row", margin: espaco[4], marginBottom: 0, padding: 3, borderRadius: raio.md, backgroundColor: cores.fundo2 },
  segmento: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: raio.sm },
  segmentoAtivo: { backgroundColor: cores.superficie },
  textoSegmento: { fontSize: fonte.sm, fontWeight: "700", color: cores.textoSuave },
  oculto: { display: "none" },
  cartao: { gap: 6, padding: espaco[4], borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco[2] },
  selos: { flexDirection: "row", flexWrap: "wrap", gap: espaco[2] },
  selosTopo: { flexShrink: 1, justifyContent: "flex-end", gap: espaco[1] },
  codigo: { fontSize: fonte.xs, fontWeight: "700", color: cores.textoSutil, fontVariant: ["tabular-nums"] },
  titulo: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  campo: { flexDirection: "row", justifyContent: "space-between", gap: espaco[3] },
  rotuloCampo: { fontSize: fonte.sm, color: cores.textoSuave },
  valorCampo: { flexShrink: 1, fontSize: fonte.sm, fontWeight: "600", color: cores.texto, textAlign: "right" },
  rodape: { fontSize: fonte.xs, color: cores.textoSutil },
  linhaDatas: { flexDirection: "row", gap: espaco[3] },
}));
