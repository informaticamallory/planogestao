/**
 * Estado do wizard de criação e validações por etapa.
 * As regras espelham o backend só para dar retorno imediato; a validação que vale é a da API.
 */
import type {
  AcaoCriar,
  AcaoDoPlano,
  AcaoEdicao,
  PlanoAtualizar,
  PlanoCriar,
  PlanoDetalhe,
  Prioridade,
  StatusAcao,
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
  /** Ações novas (na criação, todas; na edição, as incluídas agora). */
  acoes: AcaoForm[];
  /** Edição: ações e sub-itens JÁ cadastrados, alterados pelo id (nunca recriados). */
  itens: ItemForm[];
}

/**
 * Item já cadastrado, na etapa "Ações e Responsável" da edição. Só o planejamento é editável aqui; status,
 * progresso, aceite e conclusão seguem o fluxo de cada item (histórico e pontos).
 */
export interface ItemForm {
  id: number;
  numero: string;
  nivel: number;
  subitem: boolean;
  status: StatusAcao;
  /** Já iniciado: só aceita pré-requisitos já concluídos (mesma regra da API). */
  iniciado: boolean;
  /** A API permite alterar o planejamento deste item (perfil, papel, item em aberto, plano ativo). */
  editavel: boolean;
  /** Pedido de prazo aguardando resposta: prazo e responsável só mudam depois dele. */
  solicitacaoPendente: boolean;
  descricao: string;
  responsavel: UsuarioOpcao | null;
  area_id: string;
  setor_id: string;
  prazo_inicio: string;
  prazo: string;
  prioridade: Prioridade | "";
  observacao: string;
  depende_de_ids: number[];
  motivo_prazo: string;
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
    itens: [],
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
export function validarEtapa3(f: PlanoForm, rascunho: boolean, areasAcesso?: number[] | null): Erros {
  const e = validarListaAcoes(f.acoes);
  if (!rascunho && f.acoes.length === 0) e.acoes = "Para liberar o plano, cadastre pelo menos uma ação.";
  Object.assign(e, erroAreaDoPlano(f, areasAcesso));
  return e;
}

/**
 * Na criação, a área do plano vem da 1ª ação (a mesma regra do backend). Fora das áreas autorizadas de quem cria,
 * o backend recusa — o formulário avisa antes, no campo. `areasAcesso` null = todas (Administrador/"Todas as áreas").
 */
export function erroAreaDoPlano(f: PlanoForm, areasAcesso?: number[] | null): Erros {
  const primeira = f.acoes.find((a) => a.area_id);
  if (areasAcesso === undefined || areasAcesso === null || !primeira || areasAcesso.includes(Number(primeira.area_id))) return {};
  return {
    [`${primeira.chave}.area_id`]:
      "A área do plano vem desta ação, e ela não está entre as suas áreas autorizadas: escolha uma área autorizada ou " +
      "peça ao Administrador para incluí-la.",
  };
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

/** Item cadastrado → formulário (estado inicial = dados atuais). */
export function itemDoPlano(a: AcaoDoPlano): ItemForm {
  return {
    id: a.id,
    numero: a.numero,
    nivel: a.nivel,
    subitem: a.acao_pai_id !== null,
    status: a.status,
    iniciado: a.iniciada_em !== null || STATUS_INICIADOS.includes(a.status as StatusInicialAcao),
    editavel: a.operacoes.editar_planejamento ?? false,
    solicitacaoPendente: a.solicitacao_pendente ?? false,
    descricao: a.descricao,
    responsavel: { id: a.responsavel.id, nome: a.responsavel.nome, area: null },
    area_id: String(a.area.id),
    setor_id: a.setor ? String(a.setor.id) : "",
    prazo_inicio: a.prazo_inicio ?? "",
    prazo: a.prazo,
    prioridade: a.prioridade,
    observacao: a.observacao ?? "",
    depende_de_ids: a.depende_de.map((p) => p.id),
    motivo_prazo: "",
  };
}

const mesmoConjunto = (a: number[], b: number[]) => [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Só o que mudou no item (null = nada): a API altera o registro existente pelo id, com histórico campo a campo.
 * Área trocada leva a função/cargo junto (vazia = remove).
 */
export function alteracoesDoItem(item: ItemForm, original: ItemForm): AcaoEdicao | null {
  const d: AcaoEdicao = { id: item.id };
  if (item.descricao.trim() !== original.descricao) d.descricao = item.descricao.trim();
  if (item.responsavel && item.responsavel.id !== original.responsavel?.id) d.responsavel_id = item.responsavel.id;
  if (item.area_id !== original.area_id) d.area_id = Number(item.area_id);
  if (item.area_id !== original.area_id || item.setor_id !== original.setor_id) d.setor_id = item.setor_id ? Number(item.setor_id) : null;
  if (item.prazo_inicio && item.prazo_inicio !== original.prazo_inicio) d.prazo_inicio = item.prazo_inicio;
  if (item.prazo && item.prazo !== original.prazo) d.prazo = item.prazo;
  if (item.prioridade && item.prioridade !== original.prioridade) d.prioridade = item.prioridade;
  if (item.observacao.trim() !== original.observacao.trim()) d.observacao = item.observacao.trim();
  if (!mesmoConjunto(item.depende_de_ids, original.depende_de_ids)) d.depende_de = item.depende_de_ids;
  if ((d.prazo || d.prazo_inicio) && item.motivo_prazo.trim()) d.motivo_alteracao_prazo = item.motivo_prazo.trim();
  return Object.keys(d).length > 1 ? d : null;
}

export const chaveItem = (id: number) => `item-${id}`;

/** Mesmas regras da API (PATCH /acoes/{id} e PUT /planos/{id}); erros com chave "item-<id>.<campo>". */
export function validarItens(itens: ItemForm[], originais: ItemForm[], doPlano: Pick<AcaoDoPlano, "id" | "status">[] = []): Erros {
  const e: Erros = {};
  const porId = new Map(originais.map((o) => [o.id, o]));
  // Status de todos os itens do plano (inclusive arquivados, que podem ser pré-requisito).
  const statusDe = new Map([...doPlano.map((a) => [a.id, a.status] as const), ...itens.map((i) => [i.id, i.status] as const)]);
  for (const item of itens) {
    const original = porId.get(item.id);
    if (!original || !item.editavel) continue;
    const k = (campo: string) => `${chaveItem(item.id)}.${campo}`;
    if (item.descricao.trim().length < 3) e[k("descricao")] = "Descreva o que será feito (mínimo 3 caracteres).";
    if (!item.responsavel) e[k("responsavel")] = "Selecione o responsável.";
    else if (item.solicitacaoPendente && item.responsavel.id !== original.responsavel?.id)
      e[k("responsavel")] = "Há uma solicitação de prazo pendente: responda-a antes de trocar o responsável.";
    if (!item.area_id) e[k("area_id")] = "Selecione a área.";
    if (!item.prioridade) e[k("prioridade")] = "Selecione a prioridade.";
    if (!item.prazo) e[k("prazo")] = "Informe o prazo de conclusão.";
    else if (item.solicitacaoPendente && item.prazo !== original.prazo)
      e[k("prazo")] = "Há uma solicitação de prazo pendente: responda-a antes de alterar o prazo.";
    if (!item.prazo_inicio && original.prazo_inicio) e[k("prazo_inicio")] = "Informe o prazo inicial estimado.";
    else if (item.prazo_inicio && item.prazo && item.prazo_inicio > item.prazo)
      e[k("prazo_inicio")] = "O prazo inicial estimado não pode ser posterior ao prazo de conclusão.";
    const novosPendentes = item.depende_de_ids.filter((d) => !original.depende_de_ids.includes(d) && statusDe.get(d) !== "concluida");
    if (item.iniciado && novosPendentes.length)
      e[k("depende_de")] = "O item já foi iniciado: só é possível vincular pré-requisitos já concluídos.";
  }
  return e;
}

/** Etapa "Ações e Responsável" da edição: itens existentes + ações novas (liberar o rascunho exige ao menos uma). */
export function validarEtapaAcoesEdicao(
  f: PlanoForm,
  originais: ItemForm[],
  liberando: boolean,
  doPlano: Pick<AcaoDoPlano, "id" | "status">[] = [],
): Erros {
  const e = { ...validarItens(f.itens, originais, doPlano), ...validarListaAcoes(f.acoes) };
  const validas = f.itens.filter((i) => i.status !== "cancelada" && i.status !== "recusada").length + f.acoes.length;
  if (liberando && validas === 0) e.acoes = "Para liberar o plano, cadastre pelo menos uma ação.";
  return e;
}

/** Formulário preenchido com um plano existente (anexos têm aba própria). `acoes`: itens já cadastrados. */
export function formularioDoPlano(p: PlanoDetalhe, acoes: AcaoDoPlano[] = []): PlanoForm {
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
    // Arquivados ficam de fora: são somente leitura até serem desarquivados (aba Ações).
    itens: acoes.filter((a) => !a.arquivada).map(itemDoPlano),
  };
}

/**
 * `rascunho=false` num rascunho libera o plano; o status não é editável (calculado pelas ações).
 * Itens existentes vão só com o que mudou (pelo id); as ações novas, completas. Tudo numa transação na API.
 */
export function paraAtualizacao(f: PlanoForm, originais: ItemForm[] = []): PlanoAtualizar {
  const { corpo } = paraApi(f, f.rascunho);
  const { acoes: _a, ...dados } = corpo;
  const porId = new Map(originais.map((o) => [o.id, o]));
  const acoes = f.itens.flatMap((i) => {
    const original = porId.get(i.id);
    const d = original && i.editavel ? alteracoesDoItem(i, original) : null;
    return d ? [d] : [];
  });
  return { ...dados, rascunho: f.rascunho, acoes, novas_acoes: acoesParaApi(f.acoes) };
}

/** O formulário mudou em relação ao estado em que a página abriu? */
export function formularioAlterado(atual: PlanoForm, inicial: PlanoForm): boolean {
  // A chave das ações é gerada aleatoriamente e não representa conteúdo.
  const normalizar = (f: PlanoForm) =>
    JSON.stringify({ ...f, anexos: f.anexos.length, acoes: f.acoes.map(({ chave: _c, ...resto }) => resto) });
  return normalizar(atual) !== normalizar(inicial);
}
