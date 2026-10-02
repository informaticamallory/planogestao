import type { ConsultaPlanos } from "@planogestao/api-client";
import type {
  FiltroArquivados,
  OrdenacaoPlano,
  Prioridade,
  StatusFiltroPlano,
  TagPrazo,
  TipoPeriodo,
} from "@planogestao/shared-types";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { ROTULO_PERIODO, ROTULO_PRIORIDADE } from "../utils/rotulos";

// Status global (3) e situação do prazo são filtros independentes.
export const STATUS_FILTRO: StatusFiltroPlano[] = ["nao_iniciado", "em_andamento", "concluido"];
export const PRAZO_FILTRO: TagPrazo[] = ["em_atraso", "a_vencer", "no_prazo"];
const ORDENACOES: OrdenacaoPlano[] = [
  "codigo", "nome", "responsavel", "area", "prioridade", "data_inicio_estimado", "data_fim_estimado", "progresso", "status", "criado_em",
];
const ARQUIVADOS: FiltroArquivados[] = ["excluir", "incluir", "somente"];
export const TAMANHOS_PAGINA = [10, 20, 50, 100];
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Estado completo da listagem, espelhado 1:1 na querystring. */
export interface FiltrosPlanosUrl {
  q: string;
  status: StatusFiltroPlano[];
  prazo: TagPrazo[];
  /** Só rascunhos (atalho). */
  rascunho: boolean;
  prioridade: Prioridade[];
  responsavel_id: number | null;
  area_id: number | null;
  setor_id: number | null;
  tipo_id: number | null;
  origem_id: number | null;
  periodo: TipoPeriodo | null;
  data_inicio: string;
  data_fim: string;
  meus: boolean;
  arquivados: FiltroArquivados;
  ordenar: OrdenacaoPlano;
  direcao: "asc" | "desc";
  page: number;
  page_size: number;
}

export const PADRAO: FiltrosPlanosUrl = {
  q: "",
  status: [],
  prazo: [],
  rascunho: false,
  prioridade: [],
  responsavel_id: null,
  area_id: null,
  setor_id: null,
  tipo_id: null,
  origem_id: null,
  periodo: null,
  data_inicio: "",
  data_fim: "",
  meus: false,
  arquivados: "excluir",
  ordenar: "criado_em",
  direcao: "desc",
  page: 1,
  page_size: 20,
};

/** Campos editados no drawer de filtros (os demais vêm da busca, atalhos, tabela e paginação). */
export const CAMPOS_DRAWER = [
  "status", "prazo", "rascunho", "prioridade", "responsavel_id", "area_id", "setor_id", "tipo_id", "origem_id",
  "periodo", "data_inicio", "data_fim", "arquivados",
] as const satisfies readonly (keyof FiltrosPlanosUrl)[];

function inteiro(valor: string | null): number | null {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n > 0 ? n : null;
}

function lista<T extends string>(valores: string[], permitidos: readonly T[]): T[] {
  return [...new Set(valores)].filter((v): v is T => (permitidos as readonly string[]).includes(v));
}

function umDe<T extends string>(valor: string | null, permitidos: readonly T[], padrao: T): T {
  return valor !== null && (permitidos as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

export function lerFiltros(params: URLSearchParams): FiltrosPlanosUrl {
  const periodo = params.get("periodo");
  return {
    q: params.get("q") ?? "",
    status: lista(params.getAll("status"), STATUS_FILTRO),
    prazo: lista(params.getAll("prazo"), PRAZO_FILTRO),
    rascunho: params.get("rascunho") === "true",
    prioridade: lista(params.getAll("prioridade"), Object.keys(ROTULO_PRIORIDADE) as Prioridade[]),
    responsavel_id: inteiro(params.get("responsavel_id")),
    area_id: inteiro(params.get("area_id")),
    setor_id: inteiro(params.get("setor_id")),
    tipo_id: inteiro(params.get("tipo_id")),
    origem_id: inteiro(params.get("origem_id")),
    periodo: periodo && periodo in ROTULO_PERIODO ? (periodo as TipoPeriodo) : null,
    data_inicio: params.get("data_inicio") ?? "",
    data_fim: params.get("data_fim") ?? "",
    meus: params.get("meus") === "true",
    arquivados: umDe(params.get("arquivados"), ARQUIVADOS, PADRAO.arquivados),
    ordenar: umDe(params.get("ordenar"), ORDENACOES, PADRAO.ordenar),
    direcao: params.get("direcao") === "asc" ? "asc" : "desc",
    page: inteiro(params.get("page")) ?? PADRAO.page,
    page_size: TAMANHOS_PAGINA.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : PADRAO.page_size,
  };
}

/** Só grava o que difere do padrão, para a URL compartilhada ficar curta. */
function escreverFiltros(f: FiltrosPlanosUrl): URLSearchParams {
  const p = new URLSearchParams();
  (Object.keys(PADRAO) as (keyof FiltrosPlanosUrl)[]).forEach((chave) => {
    const valor = f[chave];
    if (Array.isArray(valor)) valor.forEach((v) => p.append(chave, v));
    else if (valor !== null && valor !== "" && valor !== PADRAO[chave]) p.set(chave, String(valor));
  });
  return p;
}

export function periodoCompleto(f: Pick<FiltrosPlanosUrl, "periodo" | "data_inicio" | "data_fim">): boolean {
  if (f.periodo !== "personalizado") return true;
  return ISO_DATA.test(f.data_inicio) && ISO_DATA.test(f.data_fim) && f.data_inicio <= f.data_fim;
}

/** Converte o estado da URL na query do endpoint (sem valores vazios). */
export function paraConsulta(f: FiltrosPlanosUrl): ConsultaPlanos {
  const consulta: ConsultaPlanos = {
    ordenar: f.ordenar,
    direcao: f.direcao,
    page: f.page,
    page_size: f.page_size,
  };
  if (f.q.trim()) consulta.q = f.q.trim();
  if (f.status.length) consulta.status = f.status;
  if (f.prazo.length) consulta.prazo = f.prazo;
  if (f.rascunho) consulta.rascunho = true;
  if (f.prioridade.length) consulta.prioridade = f.prioridade;
  for (const chave of ["responsavel_id", "area_id", "setor_id", "tipo_id", "origem_id"] as const) {
    if (f[chave] !== null) consulta[chave] = f[chave];
  }
  if (f.meus) consulta.meus = true;
  if (f.arquivados !== "excluir") consulta.arquivados = f.arquivados;
  // Personalizado incompleto é ignorado até as duas datas estarem válidas.
  if (f.periodo && periodoCompleto(f)) {
    consulta.periodo = f.periodo;
    if (f.periodo === "personalizado") {
      consulta.data_inicio = f.data_inicio;
      consulta.data_fim = f.data_fim;
    }
  }
  return consulta;
}

export function contarFiltrosDrawer(f: FiltrosPlanosUrl): number {
  let n = f.status.length ? 1 : 0;
  n += f.prazo.length ? 1 : 0;
  n += f.rascunho ? 1 : 0;
  n += f.prioridade.length ? 1 : 0;
  n += (["responsavel_id", "area_id", "setor_id", "tipo_id", "origem_id"] as const).filter((c) => f[c] !== null).length;
  n += f.periodo ? 1 : 0;
  n += f.arquivados !== "excluir" ? 1 : 0;
  return n;
}

export function useFiltrosPlanos() {
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => lerFiltros(params), [params]);
  const consulta = useMemo(() => paraConsulta(filtros), [filtros]);

  /** Qualquer mudança que não seja de página volta para a página 1. */
  const atualizar = useCallback(
    (parcial: Partial<FiltrosPlanosUrl>, opcoes: { replace?: boolean } = {}) => {
      setParams(
        (atual) => {
          const base = lerFiltros(atual);
          const proximo = { ...base, ...parcial };
          if (!("page" in parcial)) proximo.page = 1;
          return escreverFiltros(proximo);
        },
        { replace: opcoes.replace ?? false },
      );
    },
    [setParams],
  );

  const limparFiltros = useCallback(() => {
    atualizar({ ...Object.fromEntries(CAMPOS_DRAWER.map((c) => [c, PADRAO[c]])), q: "", meus: false });
  }, [atualizar]);

  return { filtros, consulta, atualizar, limparFiltros };
}
