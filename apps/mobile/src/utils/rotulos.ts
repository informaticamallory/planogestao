import type {
  Prioridade,
  SituacaoPrazo,
  SolicitacaoResumo,
  StatusAcao,
  StatusFiltroPlano,
  StatusPlano,
  TagPrazo,
  TipoPeriodo,
} from "@planogestao/shared-types";

type StatusSolicitacao = SolicitacaoResumo["status"];

import { cores, coresDados } from "../theme";

/** Períodos oferecidos no Início (subconjunto dos do web; mesmos valores da API). */
export const PERIODOS_INICIO: { id: TipoPeriodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes_atual", rotulo: "Mês atual" },
];

export const ROTULO_PERIODO: Record<TipoPeriodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes_atual: "Mês atual",
  trimestre: "Trimestre",
  ano: "Ano",
  personalizado: "Personalizado",
};

export const ROTULO_STATUS_FILTRO_PLANO: Record<StatusFiltroPlano, string> = {
  nao_iniciado: "Não iniciados",
  em_andamento: "Em andamento",
  concluido: "Concluídos",
};

/** Status global do plano (calculado pelo backend a partir das ações). */
export const ROTULO_STATUS_PLANO: Record<StatusPlano, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export type Selo = { rotulo: string; cor: string };

/** Cor dos 3 status de execução (mesmas para planos, ações e sub-itens). */
const COR_STATUS: Record<StatusPlano, string> = {
  nao_iniciado: coresDados.nao_iniciado,
  em_andamento: coresDados.em_andamento,
  concluido: coresDados.concluida,
};

/** Só o status de execução (3 valores); o prazo vai numa tag à parte (`prazo_tag`, ver `tagDePrazo`). */
export function statusDoPlano(status: StatusPlano): Selo {
  return { rotulo: ROTULO_STATUS_PLANO[status], cor: COR_STATUS[status] };
}

/** Tag do prazo (separada do status; o backend calcula). "Sem prazo definido" é informação neutra. */
export const ROTULO_PRAZO: Record<TagPrazo, string> = {
  em_atraso: "Em atraso",
  a_vencer: "A vencer",
  no_prazo: "No prazo",
  sem_prazo: "Sem prazo definido",
};

/** Mesmas cores do web (--cor-prazo-*): perigo, aviso, sucesso e neutro. */
export const COR_PRAZO: Record<TagPrazo, string> = {
  em_atraso: cores.perigo,
  a_vencer: cores.aviso,
  no_prazo: cores.sucesso,
  sem_prazo: cores.textoSutil,
};

export function tagDePrazo(tag: TagPrazo): Selo {
  return { rotulo: ROTULO_PRAZO[tag], cor: COR_PRAZO[tag] };
}

/** Onde a API só manda `situacao` (Minhas Ações, Calendário, Relatórios): concluída não tem tag. */
const TAG_DA_SITUACAO: Record<SituacaoPrazo, TagPrazo | null> = {
  atrasada: "em_atraso",
  vencendo: "a_vencer",
  em_andamento: "no_prazo",
  concluida: null,
};

export function tagDaSituacao(situacao: SituacaoPrazo | null): TagPrazo | null {
  return situacao ? TAG_DA_SITUACAO[situacao] : null;
}

/**
 * Situação das ações (Minhas Ações, Calendário, Relatórios); valores da API inalterados, rótulos
 * iguais às tags de prazo. "No prazo" segue azul aqui para não se confundir com "Concluída" (verde)
 * nas bolinhas do Calendário.
 */
export const SITUACAO: Record<SituacaoPrazo, { rotulo: string; cor: string }> = {
  atrasada: { rotulo: "Em atraso", cor: coresDados.atrasada },
  vencendo: { rotulo: "A vencer", cor: coresDados.vencendo },
  em_andamento: { rotulo: "No prazo", cor: coresDados.em_andamento },
  concluida: { rotulo: "Concluída", cor: coresDados.concluida },
};

/**
 * Status de execução da ação/sub-item (mesmos 3 do plano). Recusada e cancelada são descartes:
 * ficam fora dos 3 e não têm tag de prazo.
 */
const EXECUCAO_DA_ACAO: Record<StatusAcao, StatusPlano | null> = {
  aguardando_aceite: "nao_iniciado",
  aceita: "nao_iniciado",
  em_andamento: "em_andamento",
  bloqueada: "em_andamento",
  concluida: "concluido",
  recusada: null,
  cancelada: null,
};

/** Condição do fluxo, mostrada à parte do status como rótulo secundário neutro. */
const CONDICAO_DA_ACAO: Partial<Record<StatusAcao, string>> = {
  aguardando_aceite: "Aguardando aceite",
  bloqueada: "Bloqueada",
};

const ROTULO_DESCARTE: Partial<Record<StatusAcao, string>> = { recusada: "Recusada", cancelada: "Cancelada" };

/** Status de execução da ação + condição do fluxo (aguardando aceite/bloqueada), se houver. */
export function statusDaAcao(status: StatusAcao): Selo & { condicao: Selo | null } {
  const execucao = EXECUCAO_DA_ACAO[status];
  const condicao = CONDICAO_DA_ACAO[status];
  return {
    ...(execucao ? statusDoPlano(execucao) : { rotulo: ROTULO_DESCARTE[status]!, cor: cores.textoSuave }),
    condicao: condicao ? { rotulo: condicao, cor: cores.textoSuave } : null,
  };
}

/** Status em texto corrido (listas, histórico): "Não iniciado · Aguardando aceite". */
export function textoStatusAcao(status: StatusAcao): string {
  const s = statusDaAcao(status);
  return s.condicao ? `${s.rotulo} · ${s.condicao.rotulo}` : s.rotulo;
}

/**
 * Selos de um registro individual, nesta ordem: status de execução, tag de prazo e condição.
 * Concluídas e descartadas não mostram tag de prazo pendente.
 */
export function selosDaAcao(status: StatusAcao, tag: TagPrazo | null): Selo[] {
  const s = statusDaAcao(status);
  const comPrazo = tag !== null && acaoEmAberto(status);
  return [{ rotulo: s.rotulo, cor: s.cor }, ...(comPrazo ? [tagDePrazo(tag)] : []), ...(s.condicao ? [s.condicao] : [])];
}

/** "2" → "Ação 2"; "2.1" → "Sub-item 2.1" (o número vem pronto do backend). */
export function rotuloNumeroAcao(numero: string): string {
  return numero.includes(".") ? `Sub-item ${numero}` : `Ação ${numero}`;
}

/** Status em que a ação ainda está aberta (é neles que "aguardando ação anterior" faz sentido). */
const STATUS_ACAO_ABERTOS: StatusAcao[] = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada"];

export function acaoEmAberto(status: StatusAcao): boolean {
  return STATUS_ACAO_ABERTOS.includes(status);
}

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Prioridade baixa",
  media: "Prioridade média",
  alta: "Prioridade alta",
  critica: "Prioridade crítica",
};

export const ROTULO_SOLICITACAO: Record<StatusSolicitacao, string> = {
  pendente: "Pendente",
  aceita: "Aprovada",
  recusada: "Recusada",
};
