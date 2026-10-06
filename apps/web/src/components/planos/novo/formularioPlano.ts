/**
 * Estado do wizard de criação e validações por etapa.
 * As regras espelham o backend só para dar retorno imediato; a validação que vale é a da API.
 */
import type {
  AcaoCriar,
  PlanoAtualizar,
  PlanoCriar,
  PlanoDetalhe,
  Prioridade,
  StatusInicialAcao,
  UsuarioOpcao,
} from "@planogestao/shared-types";

import { formatarData, paraIsoData } from "../../../utils/datas";

export interface AcaoForm {
  chave: string; // identidade estável na lista (para React, remoção e dependências)
  descricao: string;
  responsavel: UsuarioOpcao | null;
  area_id: string;
  setor_id: string;
  /** Prazo inicial estimado (previsão de início). */
  prazo_inicio: string;
  /** Prazo de conclusão. */
  prazo: string;
  prioridade: Prioridade | "";
  status: StatusInicialAcao;
  progresso: number;
  observacao: string;
  /** "Depende da conclusão de": chaves de outras ações desta mesma lista. */
  depende_de: string[];
  /** Pré-requisitos já cadastrados no plano (ao adicionar ações a um plano existente). */
  depende_de_ids: number[];
}

export interface PlanoForm {
  nome: string;
  tipo_id: string;
  origem_id: string;
  area_id: string;
  setor_id: string;
  responsavel: UsuarioOpcao | null;
  data_inicio_estimado: string;
  data_fim_estimado: string;
  prioridade: Prioridade | "";
  /** Rascunho (condição à parte do status, que é calculado pelas ações). */
  rascunho: boolean;
  descricao: string;
  descricao_problema: string;
  objetivo: string;
  causa: string;
  evidencias: string;
  observacoes: string;
  anexos: File[];
  acoes: AcaoForm[];
}

export type Erros = Record<string, string>;

export function hojeIso(): string {
  return paraIsoData(new Date());
}

/** Nova ação; herda área/função-cargo da ação anterior (costuma ser a mesma equipe). */
export function novaAcao(prioridade: Prioridade | "", anterior?: AcaoForm): AcaoForm {
  return {
    chave: crypto.randomUUID(),
    descricao: "",
    responsavel: null,
    area_id: anterior?.area_id ?? "",
    setor_id: anterior?.setor_id ?? "",
    prazo_inicio: "",
    prazo: "",
    prioridade,
    status: "aguardando_aceite",
    progresso: 0,
    observacao: "",
    depende_de: [],
    depende_de_ids: [],
  };
}

export function formularioInicial(): PlanoForm {
  return {
    nome: "",
    tipo_id: "",
    origem_id: "",
    area_id: "",
    setor_id: "",
    responsavel: null,
    data_inicio_estimado: hojeIso(),
    data_fim_estimado: "",
    prioridade: "",
    rascunho: false,
    descricao: "",
    descricao_problema: "",
    objetivo: "",
    causa: "",
    evidencias: "",
    observacoes: "",
    anexos: [],
    acoes: [novaAcao("")],
  };
}

/** Status que fixam o progresso (não iniciada = 0, concluída = 100). */
export function progressoFixo(status: StatusInicialAcao): number | null {
  if (status === "aguardando_aceite" || status === "aceita") return 0;
  if (status === "concluida") return 100;
  return null;
}

// ---- validações ------------------------------------------------------------------

export function validarEtapa1(f: PlanoForm): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 3) e.nome = "Informe o nome do plano (mínimo 3 caracteres).";
  if (!f.tipo_id) e.tipo_id = "Selecione o tipo.";
  if (!f.origem_id) e.origem_id = "Selecione a origem.";
  // Área/função-cargo são escolhidos em cada ação (etapa "Ações e Responsável").
  if (!f.responsavel) e.responsavel = "Selecione o responsável.";
  if (!f.prioridade) e.prioridade = "Selecione a prioridade.";
  if (!f.data_inicio_estimado) e.data_inicio_estimado = "Informe o início estimado.";
  if (!f.data_fim_estimado) e.data_fim_estimado = "Informe o fim estimado.";
  else if (f.data_inicio_estimado && f.data_fim_estimado < f.data_inicio_estimado)
    e.data_fim_estimado = "A data fim estimada não pode ser anterior à data de início estimada.";
  return e;
}

/** Etapa 2 só é obrigatória quando o plano vai ser iniciado (não rascunho). */
export function validarEtapa2(f: PlanoForm, rascunho: boolean): Erros {
  if (rascunho) return {};
  const e: Erros = {};
  if (!f.descricao_problema.trim()) e.descricao_problema = "Descreva o problema identificado.";
  if (!f.objetivo.trim()) e.objetivo = "Informe o objetivo.";
  return e;
}

export function validarAcao(a: AcaoForm): Erros {
  const e: Erros = {};
  if (a.descricao.trim().length < 3) e.descricao = "Descreva o que será feito (mínimo 3 caracteres).";
  if (!a.responsavel) e.responsavel = "Selecione o responsável.";
  if (!a.area_id) e.area_id = "Selecione a área.";
  if (!a.prazo_inicio) e.prazo_inicio = "Informe o prazo inicial estimado.";
  if (!a.prazo) e.prazo = "Informe o prazo de conclusão.";
  else if (a.prazo_inicio && a.prazo_inicio > a.prazo)
    e.prazo_inicio = "O prazo inicial estimado não pode ser posterior ao prazo de conclusão.";
  if (!a.prioridade) e.prioridade = "Selecione a prioridade.";
  return e;
}

/** A ação `chave` depende (direta ou indiretamente) de `alvo`? Usado para impedir ciclos na tela. */
export function dependeDe(acoes: AcaoForm[], chave: string, alvo: string, vistos = new Set<string>()): boolean {
  const acao = acoes.find((a) => a.chave === chave);
  if (!acao || vistos.has(chave)) return false;
  vistos.add(chave);
  return acao.depende_de.some((d) => d === alvo || dependeDe(acoes, d, alvo, vistos));
}

/** Erros da etapa 3 com chave "<chave da ação>.<campo>" (+ "acoes" para a lista). */
export function validarEtapa3(f: PlanoForm, rascunho: boolean): Erros {
  const e = validarListaAcoes(f.acoes);
  if (!rascunho && f.acoes.length === 0) e.acoes = "Para liberar o plano, cadastre pelo menos uma ação.";
  return e;
}

/**
 * Foca o primeiro campo com erro e o centraliza na tela (o rodapé fixo não o cobre).
 * Roda no próximo quadro, depois de a aba com o erro ter sido exibida.
 */
export function focarPrimeiroErro() {
  requestAnimationFrame(() => {
    const campo = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    campo?.focus({ preventScroll: true });
    campo?.scrollIntoView({ block: "center" });
  });
}

/** Avisos não bloqueantes (mesma regra do backend). */
export function avisoPrazoAcao(acao: AcaoForm, fimEstimado: string): string | null {
  if (acao.prazo && fimEstimado && acao.prazo > fimEstimado) {
    return `O prazo desta ação é posterior ao fim estimado do plano (${formatarData(fimEstimado)}).`;
  }
  return null;
}

// ---- conversão para a API ------------------------------------------------------------

const texto = (v: string) => (v.trim() ? v.trim() : null);

/** Erros de uma lista de ações, com chave "<chave da ação>.<campo>". */
const STATUS_INICIADOS: StatusInicialAcao[] = ["em_andamento", "bloqueada", "concluida"];

export function validarListaAcoes(acoes: AcaoForm[]): Erros {
  const e: Erros = {};
  acoes.forEach((acao) => {
    for (const [campo, msg] of Object.entries(validarAcao(acao))) e[`${acao.chave}.${campo}`] = msg;
    // Mesma regra do backend: dependente só nasce iniciada com os pré-requisitos concluídos.
    const iniciada = STATUS_INICIADOS.includes(acao.status) || acao.progresso > 0;
    const pendentes = acao.depende_de
      .map((c) => acoes.findIndex((a) => a.chave === c))
      .filter((j) => j >= 0 && acoes[j]!.status !== "concluida");
    if (iniciada && pendentes.length) {
      e[`${acao.chave}.status`] =
        `Aguardando ação anterior: conclua ${pendentes.map((j) => `a Ação ${j + 1}`).join(", ")} antes de iniciar esta.`;
    }
  });
  return e;
}

/**
 * Converte as ações para a API. As dependências entre ações do mesmo envio viram posições
 * (depende_de_novas); vínculos com ações que ficaram de fora (incompletas no rascunho) são descartados.
 */
export function acoesParaApi(acoes: AcaoForm[]): AcaoCriar[] {
  const posicao = new Map(acoes.map((a, i) => [a.chave, i]));
  return acoes.map((a) => ({
    descricao: a.descricao.trim(),
    responsavel_id: a.responsavel!.id,
    area_id: Number(a.area_id),
    setor_id: a.setor_id ? Number(a.setor_id) : null,
    prazo_inicio: a.prazo_inicio,
    prazo: a.prazo,
    prioridade: a.prioridade as Prioridade,
    status: a.status,
    progresso: progressoFixo(a.status) ?? a.progresso,
    observacao: texto(a.observacao),
    depende_de: a.depende_de_ids,
    depende_de_novas: a.depende_de.flatMap((c) => (posicao.has(c) ? [posicao.get(c)!] : [])),
  }));
}

const acaoCompleta = (a: AcaoForm) => Object.keys(validarAcao(a)).length === 0;
const acaoVazia = (a: AcaoForm) => !a.descricao.trim() && !a.responsavel && !a.prazo && !a.observacao.trim();

/** Ações começadas mas incompletas, que ficariam de fora de um rascunho (cartões vazios não contam). */
export function contarAcoesIncompletas(f: PlanoForm): number {
  return f.acoes.filter((a) => !acaoCompleta(a) && !acaoVazia(a)).length;
}

/**
 * Monta o corpo do POST /planos. Exige a etapa 1 válida. No rascunho, ações
 * incompletas ficam de fora (fora do rascunho, a validação já as barrou antes).
 */
export function paraApi(f: PlanoForm, rascunho: boolean): { corpo: PlanoCriar } {
  const completas = f.acoes.filter(acaoCompleta);
  return {
    corpo: {
      nome: f.nome.trim(),
      tipo_id: Number(f.tipo_id),
      origem_id: Number(f.origem_id),
      // Na criação, a área do plano vem da 1ª ação (backend); na edição, mantém a atual.
      area_id: f.area_id ? Number(f.area_id) : null,
      setor_id: f.area_id && f.setor_id ? Number(f.setor_id) : null,
      responsavel_id: f.responsavel!.id,
      data_inicio_estimado: f.data_inicio_estimado,
      data_fim_estimado: f.data_fim_estimado,
      prioridade: f.prioridade as Prioridade,
      // O status não é enviado: o backend calcula pelas ações.
      rascunho,
      descricao: texto(f.descricao),
      descricao_problema: texto(f.descricao_problema),
      objetivo: texto(f.objetivo),
      causa: texto(f.causa),
      evidencias: texto(f.evidencias),
      observacoes: texto(f.observacoes),
      acoes: acoesParaApi(completas),
    },
  };
}

// ---- edição ---------------------------------------------------------------------------

/** Formulário preenchido com um plano existente (sem ações/anexos, que têm abas próprias). */
export function formularioDoPlano(p: PlanoDetalhe): PlanoForm {
  return {
    ...formularioInicial(),
    nome: p.nome,
    tipo_id: String(p.tipo.id),
    origem_id: String(p.origem.id),
    area_id: String(p.area.id),
    setor_id: p.setor ? String(p.setor.id) : "",
    responsavel: { id: p.responsavel.id, nome: p.responsavel.nome, area: null },
    data_inicio_estimado: p.data_inicio_estimado,
    data_fim_estimado: p.data_fim_estimado,
    prioridade: p.prioridade,
    rascunho: p.rascunho,
    descricao: p.descricao ?? "",
    descricao_problema: p.descricao_problema ?? "",
    objetivo: p.objetivo ?? "",
    causa: p.causa ?? "",
    evidencias: p.evidencias ?? "",
    observacoes: p.observacoes ?? "",
    acoes: [],
  };
}

/** `rascunho=false` num rascunho libera o plano; o status não é editável (calculado pelas ações). */
export function paraAtualizacao(f: PlanoForm): PlanoAtualizar {
  const { corpo } = paraApi(f, f.rascunho);
  const { acoes: _a, ...dados } = corpo;
  return { ...dados, rascunho: f.rascunho };
}

/** O formulário mudou em relação ao estado em que a página abriu? */
export function formularioAlterado(atual: PlanoForm, inicial: PlanoForm): boolean {
  // A chave das ações é gerada aleatoriamente e não representa conteúdo.
  const normalizar = (f: PlanoForm) =>
    JSON.stringify({ ...f, anexos: f.anexos.length, acoes: f.acoes.map(({ chave: _c, ...resto }) => resto) });
  return normalizar(atual) !== normalizar(inicial);
}
