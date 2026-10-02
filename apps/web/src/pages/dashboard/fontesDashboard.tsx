/**
 * Dados do painel do Dashboard, por tipo_dado (catálogo do backend: /preferencias/dashboard).
 * O Dashboard é a visão geral (totais, status, situação do prazo, progresso e pendências); o
 * detalhamento fica em Indicadores, aberto daqui com o mesmo período.
 * O React Query compartilha a consulta: os cards fazem uma única chamada a /dashboard/resumo.
 */
import type { CategoriaAcao, ResumoDashboard } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { AtividadesRecentes } from "../../components/dashboard/AtividadesRecentes";
import { MiniCalendario } from "../../components/dashboard/MiniCalendario";
import { MinhasAcoes } from "../../components/dashboard/MinhasAcoes";
import { PlanosRecentes } from "../../components/dashboard/PlanosRecentes";
import type { FonteWidget, Fontes, ResultadoFonte } from "../../components/painel/tipos";
import { useAtividadesRecentes, useEvolucaoPlanos, useMinhasAcoes, usePlanosRecentes, useResumoDashboard, useStatusAcoes } from "../../hooks/useDashboard";
import { filtroComoQuery, useFiltroPeriodo } from "../../hooks/useFiltroPeriodo";
import { formatarData, formatarDiaMes, formatarMesAno } from "../../utils/datas";
import {
  COR_CATEGORIA,
  ROTULO_CATEGORIA_ACAO,
  ROTULO_PRAZO,
  ROTULO_STATUS_EXECUCAO,
  TOKEN_PRAZO,
  TOKEN_STATUS_EXECUCAO,
} from "../../utils/rotulos";

const estado = (q: { isLoading: boolean; isFetching: boolean; error: unknown }) => ({
  isLoading: q.isLoading,
  error: q.error,
  atualizando: q.isFetching && !q.isLoading,
});

// Só os campos numéricos do resumo viram card de contagem.
type CampoContagem = { [K in keyof ResumoDashboard]: ResumoDashboard[K] extends number ? K : never }[keyof ResumoDashboard];

/**
 * Card de contagem com drill-down para a listagem já filtrada (mesmo período do painel).
 * `filtro` é "status=…" ou, para a situação do prazo dos planos, "prazo=…".
 */
function contagem(campo: CampoContagem, rota: "/planos" | "/acoes", status?: string, corToken?: string, parametro = "status"): FonteWidget {
  return {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      // parametro vazio: `status` já é a query pronta (ex.: "nivel=principal&status=concluido").
      const recorte = status ? (parametro ? `${parametro}=${status}` : status) : "";
      const destino = `${rota}?${recorte ? `${recorte}&` : ""}${filtroComoQuery(filtro)}`;
      return { ...estado(q), conteudo: q.data && { forma: "numero", valor: q.data[campo].toLocaleString("pt-BR"), destino, corToken } };
    },
  };
}

// Só os 3 status de execução; o atraso é tag de prazo, contado no seu próprio card.
const ORDEM_CATEGORIAS: CategoriaAcao[] = ["pendente", "em_andamento", "concluida"];
const SERIES_EVOLUCAO = [
  { chave: "criados", nome: "Criados", token: "--cor-dado-em-andamento" },
  { chave: "atrasados", nome: "Em atraso", token: TOKEN_PRAZO.em_atraso },
  { chave: "concluidos", nome: "Concluídos", token: "--cor-dado-concluida" },
];

// Situação do prazo dos não concluídos, por grupo (cada registro uma vez, à parte do status).
const ROTULO_GRUPO: Record<string, string> = { planos: "Planos", acoes: "Ações", subitens: "Sub-itens" };
const SERIES_STATUS = (["nao_iniciado", "em_andamento", "concluido"] as const).map((t) => ({
  chave: t,
  nome: ROTULO_STATUS_EXECUCAO[t],
  token: TOKEN_STATUS_EXECUCAO[t],
}));
const SERIES_PRAZO = (["em_atraso", "a_vencer", "no_prazo"] as const).map((t) => ({ chave: t, nome: ROTULO_PRAZO[t], token: TOKEN_PRAZO[t] }));

/** Link do resumo para o detalhamento em Indicadores, com o mesmo período. */
const LinkIndicadores = ({ query }: { query: string }) => <Link to={`/indicadores?${query}`}>Detalhar em Indicadores</Link>;

function lista(useConsulta: () => ResultadoFonte): FonteWidget {
  return { useDado: useConsulta };
}

export const FONTES_DASHBOARD: Fontes = {
  total_planos: contagem("total_planos", "/planos"),
  // Totais: ações principais e sub-itens de todos os níveis, cada um uma vez (criados no período).
  total_acoes: contagem("total_acoes", "/acoes", "nivel=principal", undefined, ""),
  total_subitens: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      const d = q.data;
      return {
        ...estado(q),
        conteudo: d && {
          forma: "numero",
          valor: d.total_subitens.toLocaleString("pt-BR"),
          detalhe: `${d.subitens_nao_iniciados} não iniciados · ${d.subitens_em_andamento} em andamento · ${d.subitens_concluidos} concluídos`,
          destino: `/acoes?nivel=subacao&${filtroComoQuery(filtro)}`,
          tom: "info",
        },
      };
    },
  },
  progresso_geral: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      const p = q.data?.progresso_geral ?? null;
      return {
        ...estado(q),
        conteudo: q.data && {
          forma: "numero",
          valor: p === null ? "—" : `${p.toLocaleString("pt-BR")}%`,
          percentual: p,
          detalhe: "Média do progresso dos PAs do período",
          destino: `/indicadores?${filtroComoQuery(filtro)}`,
          tom: "primaria",
        },
      };
    },
  },
  planos_nao_iniciados: contagem("planos_nao_iniciados", "/planos", "nao_iniciado", "--cor-dado-nao-iniciado"),
  planos_ativos: contagem("planos_ativos", "/planos", "em_andamento"),
  // Tag de prazo (qualquer status não concluído), não um status.
  planos_atrasados: contagem("planos_atrasados", "/planos", "em_atraso", "--cor-prazo-em_atraso", "prazo"),
  planos_concluidos: contagem("planos_concluidos", "/planos", "concluido", COR_CATEGORIA.concluida),
  // Abrem a listagem de itens (só ações principais, criadas no período). Status de execução e tag de prazo
  // são contados à parte: uma ação em andamento e vencida entra em "em andamento" e em "em atraso".
  acoes_pendentes: contagem("acoes_pendentes", "/acoes", "nivel=principal&status=nao_iniciado", COR_CATEGORIA.pendente, ""),
  acoes_em_andamento: contagem("acoes_em_andamento", "/acoes", "nivel=principal&status=em_andamento", COR_CATEGORIA.em_andamento, ""),
  acoes_atrasadas: contagem("acoes_atrasadas", "/acoes", "nivel=principal&prazo=em_atraso", TOKEN_PRAZO.em_atraso, ""),
  acoes_concluidas: contagem("acoes_concluidas", "/acoes", "nivel=principal&status=concluido", COR_CATEGORIA.concluida, ""),

  percentual_cumprimento: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      const p = q.data?.percentual_cumprimento ?? null;
      return {
        ...estado(q),
        conteudo: q.data && { forma: "numero", valor: p === null ? "—" : `${p.toLocaleString("pt-BR")}%`, percentual: p, detalhe: "Ações concluídas até o prazo", tom: "sucesso" },
      };
    },
  },

  evolucao_planos: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useEvolucaoPlanos(filtro);
      const d = q.data;
      return {
        ...estado(q),
        vazio: d?.pontos.length === 0,
        conteudo: d && {
          forma: "serie",
          rotuloIntervalo: "Intervalo",
          series: SERIES_EVOLUCAO,
          pontos: d.pontos.map((p) => ({
            rotulo: d.granularidade === "mes" ? formatarMesAno(p.inicio) : formatarDiaMes(p.inicio),
            descricao: p.inicio === p.fim ? formatarData(p.inicio) : `${formatarData(p.inicio)} a ${formatarData(p.fim)}`,
            criados: p.criados,
            atrasados: p.atrasados,
            concluidos: p.concluidos,
          })),
        },
      };
    },
  },

  // Status de execução dos PAs, ações e sub-itens (cada registro uma vez), ao lado da situação do prazo.
  status_execucao: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      const grupos = q.data?.status_execucao ?? [];
      return {
        ...estado(q),
        vazio: q.data ? grupos.every((g) => g.nao_iniciado + g.em_andamento + g.concluido === 0) : undefined,
        mensagemVazio: "Nada criado no período.",
        acoes: <LinkIndicadores query={filtroComoQuery(filtro)} />,
        conteudo: q.data && {
          forma: "empilhado",
          rotuloGrupo: "Registro",
          series: SERIES_STATUS,
          grupos: grupos.map((g) => ({ nome: ROTULO_GRUPO[g.grupo] ?? g.grupo, nao_iniciado: g.nao_iniciado, em_andamento: g.em_andamento, concluido: g.concluido })),
        },
      };
    },
  },

  situacao_prazo: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useResumoDashboard(filtro);
      const grupos = q.data?.situacao_prazo ?? [];
      return {
        ...estado(q),
        vazio: q.data ? grupos.every((g) => g.em_atraso + g.a_vencer + g.no_prazo === 0) : undefined,
        mensagemVazio: "Nada em aberto no período.",
        acoes: <LinkIndicadores query={filtroComoQuery(filtro)} />,
        conteudo: q.data && {
          forma: "empilhado",
          rotuloGrupo: "Registro",
          series: SERIES_PRAZO,
          grupos: grupos.map((g) => ({ nome: ROTULO_GRUPO[g.grupo] ?? g.grupo, em_atraso: g.em_atraso, a_vencer: g.a_vencer, no_prazo: g.no_prazo })),
        },
      };
    },
  },

  status_acoes: {
    useDado: () => {
      const { filtro } = useFiltroPeriodo();
      const q = useStatusAcoes(filtro);
      const por = new Map(q.data?.fatias.map((f) => [f.categoria, f.total]));
      return {
        ...estado(q),
        vazio: q.data?.total === 0,
        conteudo: q.data && {
          forma: "categorias",
          rotuloTotal: "ações",
          rotuloValor: "Ações",
          itens: ORDEM_CATEGORIAS.map((c) => ({ id: c, nome: ROTULO_CATEGORIA_ACAO[c], total: por.get(c) ?? 0, token: COR_CATEGORIA[c] })),
        },
      };
    },
  },

  planos_recentes: lista(() => {
    const { filtro } = useFiltroPeriodo();
    const q = usePlanosRecentes(filtro);
    return {
      ...estado(q),
      vazio: q.data?.length === 0,
      acoes: <Link to={`/planos?${filtroComoQuery(filtro)}`}>Ver todos</Link>,
      conteudo: q.data && { forma: "personalizado", conteudo: <PlanosRecentes planos={q.data} /> },
    };
  }),

  atividades_recentes: lista(() => {
    const { filtro } = useFiltroPeriodo();
    const q = useAtividadesRecentes(filtro);
    return { ...estado(q), vazio: q.data?.length === 0, conteudo: q.data && { forma: "personalizado", conteudo: <AtividadesRecentes atividades={q.data} /> } };
  }),

  minhas_acoes: lista(() => {
    const q = useMinhasAcoes();
    return {
      ...estado(q),
      vazio: q.data?.length === 0,
      mensagemVazio: "Você não tem ações em aberto.",
      acoes: <Link to="/minhas-acoes">Ver todas</Link>,
      conteudo: q.data && { forma: "personalizado", conteudo: <MinhasAcoes acoes={q.data} /> },
    };
  }),

  // O calendário busca o próprio mês (navegação interna); o widget só dá a moldura.
  mini_calendario: lista(() => ({ isLoading: false, error: null, conteudo: { forma: "personalizado", conteudo: <MiniCalendario /> } })),
};
