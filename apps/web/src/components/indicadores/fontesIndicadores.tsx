/**
 * Dados do painel dos Indicadores, por tipo_dado (catálogo do backend: /preferencias/indicadores).
 * Mesmos endpoints da Fase 9; cada fonte só converte a resposta para uma forma de widget.
 *
 * A aba Indicadores da equipe reaproveita o mesmo painel com o endpoint agregado
 * (/equipes/{id}/indicadores): o contexto informa `agregado` e as consultas individuais não rodam.
 */
import type { FiltrosIndicadores } from "@planogestao/api-client";
import type { IndicadoresEquipe } from "@planogestao/shared-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import {
  useAcoesPorStatus,
  useCumprimentoPrazo,
  useEvolucaoMensal,
  useIndicadoresGerais,
  useItensPorNivel,
  useItensPorPlano,
  usePlanosPor,
  usePlanosPorPrazo,
  usePlanosPorStatus,
  useResponsaveisComPendencias,
  useSubitensPorResponsavel,
} from "../../hooks/useIndicadores";
import { formatarMesAno } from "../../utils/datas";
import { ROTULO_STATUS_EXECUCAO, TOKEN_PRAZO, TOKEN_STATUS_EXECUCAO, type StatusExecucao } from "../../utils/rotulos";
import type { ConteudoWidget, FonteWidget, Fontes, ResultadoFonte, SerieDef } from "../painel/tipos";

interface Agregado {
  data: IndicadoresEquipe | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

export interface ContextoIndicadores {
  filtros: FiltrosIndicadores;
  agregado?: Agregado;
  mensagemSemPendencias?: string;
}

export const ContextoFonteIndicadores = createContext<ContextoIndicadores>({ filtros: { periodo: "ano" } });

type Parte = Exclude<keyof IndicadoresEquipe, "membros">;

/** A consulta da página ou a parte correspondente do endpoint agregado da equipe. */
function useConsulta<T>(usar: (f: FiltrosIndicadores, ativo: boolean) => UseQueryResult<T>, parte: Parte | null) {
  const ctx = useContext(ContextoFonteIndicadores);
  const q = usar(ctx.filtros, !ctx.agregado);
  if (ctx.agregado && parte) {
    const a = ctx.agregado;
    return { data: a.data?.[parte] as T | undefined, isLoading: a.isLoading, isFetching: a.isFetching, error: a.error };
  }
  return { data: q.data, isLoading: q.isLoading, isFetching: q.isFetching, error: q.error };
}

const estado = (q: { isLoading: boolean; isFetching: boolean; error: unknown }) => ({
  isLoading: q.isLoading,
  error: q.error,
  atualizando: q.isFetching && !q.isLoading,
});
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}%`);
const dias = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")} dias`);

type Gerais = IndicadoresEquipe["gerais"];

function kpi(montar: (g: Gerais) => Extract<ConteudoWidget, { forma: "numero" }>): FonteWidget {
  return {
    useDado: () => {
      const q = useConsulta(useIndicadoresGerais, "gerais");
      return { ...estado(q), conteudo: q.data && montar(q.data) };
    },
  };
}

// Ordem das fatias/séries = ordens validadas da paleta (ver skill de dataviz).
// Status global (3) e situação do prazo são gráficos separados: um plano em andamento pode estar em atraso.
const STATUS_PLANO = [
  { id: "nao_iniciado", nome: "Não iniciados", token: "--cor-dado-nao-iniciado" },
  { id: "em_andamento", nome: "Em andamento", token: "--cor-dado-em-andamento" },
  { id: "concluido", nome: "Concluídos", token: "--cor-dado-concluida" },
];
// Ações: os mesmos 3 status de execução (recusadas/canceladas e o prazo ficam de fora deste gráfico).
const STATUS_ACAO = (["nao_iniciado", "em_andamento", "concluido"] as StatusExecucao[]).map((id) => ({
  id,
  nome: ROTULO_STATUS_EXECUCAO[id],
  token: TOKEN_STATUS_EXECUCAO[id],
}));
const PRAZO_PLANO = [
  { id: "em_atraso", nome: "Em atraso", token: "--cor-prazo-em_atraso" },
  { id: "a_vencer", nome: "A vencer (até 3 dias)", token: "--cor-prazo-a_vencer" },
  { id: "no_prazo", nome: "No prazo", token: "--cor-prazo-no_prazo" },
];
const SERIES_PLANOS: SerieDef[] = [
  { chave: "nao_iniciados", nome: "Não iniciados", token: "--cor-dado-nao-iniciado" },
  { chave: "em_andamento", nome: "Em andamento", token: "--cor-dado-em-andamento" },
  { chave: "concluidos", nome: "Concluídos", token: "--cor-dado-concluida" },
];
const SERIES_EVOLUCAO: SerieDef[] = [
  { chave: "criados", nome: "Criados", token: "--cor-dado-em-andamento" },
  { chave: "atrasados", nome: "Em atraso", token: TOKEN_PRAZO.em_atraso },
  { chave: "concluidos", nome: "Concluídos", token: "--cor-dado-concluida" },
];
const ROTULO_PRIORIDADE: Record<string, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };

function porDimensao(dimensao: "setor" | "area" | "responsavel" | "prioridade", rotulo: string): FonteWidget {
  return {
    useDado: () => {
      const q = useConsulta((f, ativo) => usePlanosPor(dimensao, f, ativo), null);
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        conteudo: q.data && {
          forma: "empilhado",
          rotuloGrupo: rotulo,
          series: SERIES_PLANOS,
          grupos: q.data.map((g) => ({ ...g, nome: dimensao === "prioridade" ? ROTULO_PRIORIDADE[g.nome] ?? g.nome : g.nome })),
        },
      };
    },
  };
}

const COMUNS: Fontes = {
  pct_planos_concluidos: kpi((g) => ({
    forma: "numero",
    valor: pct(g.percentual_planos_concluidos),
    percentual: g.percentual_planos_concluidos,
    detalhe: `${g.planos_concluidos} de ${g.total_planos} planos ativos (${g.planos_em_atraso} em atraso)`,
    corToken: "--success",
  })),
  pct_acoes_concluidas: kpi((g) => ({
    forma: "numero",
    valor: pct(g.percentual_acoes_concluidas),
    percentual: g.percentual_acoes_concluidas,
    detalhe: `${g.acoes_concluidas} de ${g.total_acoes} ações`,
    corToken: "--success",
  })),
  pct_subitens_concluidos: kpi((g) => ({
    forma: "numero",
    valor: g.percentual_subitens_concluidos === null ? "Sem sub-itens" : pct(g.percentual_subitens_concluidos),
    percentual: g.percentual_subitens_concluidos,
    detalhe: `${g.subitens_concluidos} de ${g.total_subitens} sub-itens (todos os níveis)`,
    corToken: "--success",
  })),
  pct_acoes_no_prazo: kpi((g) => ({
    forma: "numero",
    valor: pct(g.percentual_acoes_no_prazo),
    percentual: g.percentual_acoes_no_prazo,
    detalhe: "Concluídas até o prazo ÷ (concluídas + em atraso)",
    corToken: "--info",
  })),
  pct_acoes_atrasadas: kpi((g) => ({
    forma: "numero",
    valor: pct(g.percentual_acoes_atrasadas),
    percentual: g.percentual_acoes_atrasadas,
    detalhe: `${g.acoes_atrasadas} ação(ões) em atraso (não concluídas)`,
    corToken: "--danger",
  })),
  tempo_medio_planos: kpi((g) => ({ forma: "numero", valor: dias(g.tempo_medio_conclusao_planos_dias), detalhe: "Do início estimado à conclusão" })),
  tempo_medio_acoes: kpi((g) => ({ forma: "numero", valor: dias(g.tempo_medio_conclusao_acoes_dias), detalhe: "Da criação à conclusão" })),

  planos_por_status: {
    useDado: () => {
      const q = useConsulta(usePlanosPorStatus, "planos_por_status");
      const total = q.data?.reduce((s, x) => s + x.total, 0);
      return {
        ...estado(q),
        vazio: total === 0,
        conteudo: q.data && {
          forma: "categorias",
          rotuloTotal: "planos",
          rotuloValor: "Planos",
          itens: STATUS_PLANO.map((f) => ({ ...f, total: q.data!.find((s) => s.status === f.id)?.total ?? 0 })),
        },
      };
    },
  },

  planos_por_prazo: {
    useDado: () => {
      const q = useConsulta(usePlanosPorPrazo, "planos_por_prazo");
      const total = q.data?.reduce((s, x) => s + x.total, 0);
      return {
        ...estado(q),
        vazio: total === 0,
        mensagemVazio: "Nenhum plano em aberto (concluídos não têm situação de prazo).",
        conteudo: q.data && {
          forma: "categorias",
          rotuloTotal: "em aberto",
          rotuloValor: "Planos",
          itens: PRAZO_PLANO.map((f) => ({ ...f, total: q.data!.find((s) => s.status === f.id)?.total ?? 0 })),
        },
      };
    },
  },

  acoes_por_status: {
    useDado: () => {
      const q = useConsulta(useAcoesPorStatus, "acoes_por_status");
      return {
        ...estado(q),
        vazio: q.data?.every((s) => s.total === 0),
        conteudo: q.data && {
          forma: "categorias",
          rotuloTotal: "ações",
          rotuloValor: "Ações",
          itens: STATUS_ACAO.map((f) => ({ ...f, total: q.data!.find((s) => s.status === f.id)?.total ?? 0 })),
        },
      };
    },
  },

  cumprimento_prazo: {
    useDado: () => {
      const q = useConsulta(useCumprimentoPrazo, "cumprimento_prazo");
      const d = q.data;
      return {
        ...estado(q),
        vazio: d ? d.concluidas_no_prazo + d.concluidas_com_atraso + d.atrasadas_em_aberto + d.em_aberto_no_prazo === 0 : undefined,
        conteudo: d && {
          forma: "categorias",
          rotuloTotal: `no prazo: ${pct(d.percentual_no_prazo)}`,
          rotuloValor: "Ações",
          itens: [
            { id: "no_prazo", nome: "Concluídas no prazo", total: d.concluidas_no_prazo, token: "--cor-dado-concluida" },
            { id: "com_atraso", nome: "Concluídas com atraso", total: d.concluidas_com_atraso, token: "--cor-dado-vencendo" },
            { id: "atrasadas", nome: "Em atraso (em aberto)", total: d.atrasadas_em_aberto, token: TOKEN_PRAZO.em_atraso },
            { id: "em_aberto", nome: "Em aberto, sem atraso", total: d.em_aberto_no_prazo, token: "--cor-dado-em-andamento" },
          ],
        },
      };
    },
  },

  evolucao_mensal: {
    useDado: () => {
      const q = useConsulta(useEvolucaoMensal, "evolucao_mensal");
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        conteudo: q.data && {
          forma: "serie",
          rotuloIntervalo: "Mês",
          series: SERIES_EVOLUCAO,
          pontos: q.data.map((m) => ({
            rotulo: formatarMesAno(`${m.mes}-01`),
            descricao: formatarMesAno(`${m.mes}-01`),
            criados: m.criados,
            atrasados: m.atrasados,
            concluidos: m.concluidos,
          })),
        },
      };
    },
  },

  responsaveis_pendencias: {
    useDado: (): ResultadoFonte => {
      const ctx = useContext(ContextoFonteIndicadores);
      const q = useConsulta(useResponsaveisComPendencias, "responsaveis_com_pendencias");
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        mensagemVazio: ctx.mensagemSemPendencias ?? "Nenhuma ação em aberto nos planos filtrados.",
        conteudo: q.data && {
          forma: "empilhado",
          rotuloGrupo: "Responsável",
          // Tags de prazo das ações em aberto (mesmas cores em todo o sistema).
          series: [
            { chave: "atrasadas", nome: "Em atraso", token: "--cor-prazo-em_atraso" },
            { chave: "vencendo", nome: "A vencer (até 3 dias)", token: "--cor-prazo-a_vencer" },
            { chave: "em_andamento", nome: "No prazo", token: "--cor-prazo-no_prazo" },
          ],
          grupos: q.data,
        },
      };
    },
  },
};

// Ações e sub-itens de todos os níveis: os 3 status de execução, cada item contado uma vez.
const SERIES_STATUS_ITENS: SerieDef[] = STATUS_ACAO.map((s) => ({ chave: s.id, nome: s.nome, token: s.token }));
const SERIES_POR_PLANO: SerieDef[] = [
  { chave: "acoes_principais", nome: "Ações principais", token: "--cor-dado-em-andamento" },
  { chave: "subitens", nome: "Sub-itens", token: "--cor-dado-em-andamento" },
  { chave: "concluidos", nome: "Concluídos", token: "--cor-dado-concluida" },
  { chave: "pendentes", nome: "Pendentes", token: "--cor-dado-nao-iniciado" },
  { chave: "em_atraso", nome: "Em atraso", token: TOKEN_PRAZO.em_atraso },
];

/** Página de Indicadores: todos os dados, inclusive os agrupamentos por dimensão e o detalhamento dos sub-itens. */
export const FONTES_INDICADORES: Fontes = {
  ...COMUNS,
  itens_por_nivel: {
    useDado: () => {
      const q = useConsulta(useItensPorNivel, null);
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        mensagemVazio: "Nenhuma ação nos planos filtrados.",
        conteudo: q.data && { forma: "empilhado", rotuloGrupo: "Nível", series: SERIES_STATUS_ITENS, grupos: q.data.map((n) => ({ ...n })) },
      };
    },
  },
  subitens_por_responsavel: {
    useDado: () => {
      const q = useConsulta(useSubitensPorResponsavel, null);
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        mensagemVazio: "Nenhum sub-item nos planos filtrados.",
        conteudo: q.data && { forma: "empilhado", rotuloGrupo: "Responsável", series: SERIES_STATUS_ITENS, grupos: q.data.map((r) => ({ ...r })) },
      };
    },
  },
  itens_por_plano: {
    useDado: () => {
      const q = useConsulta(useItensPorPlano, null);
      return {
        ...estado(q),
        vazio: q.data?.length === 0,
        mensagemVazio: "Nenhuma ação nos planos filtrados.",
        conteudo: q.data && {
          forma: "empilhado",
          rotuloGrupo: "PA",
          series: SERIES_POR_PLANO,
          grupos: q.data.map(({ codigo, nome, ...n }) => ({ ...n, nome: `${codigo} — ${nome}` })),
        },
      };
    },
  },
  planos_por_setor: porDimensao("setor", "Setor"),
  planos_por_area: porDimensao("area", "Área"),
  planos_por_responsavel: porDimensao("responsavel", "Responsável"),
  planos_por_prioridade: porDimensao("prioridade", "Prioridade"),
};

/** Aba da equipe: o endpoint agregado não traz os agrupamentos por dimensão. */
export const FONTES_INDICADORES_EQUIPE: Fontes = COMUNS;
