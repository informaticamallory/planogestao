import type { CategoriaAcao, Prioridade, StatusAcao, StatusPlano, TagPrazo, TipoPeriodo } from "@planogestao/shared-types";

export const ROTULO_PERIODO: Record<TipoPeriodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes_atual: "Mês atual",
  trimestre: "Trimestre",
  ano: "Ano",
  personalizado: "Personalizado",
};

/**
 * Status de execução: só estes 3, para PA, ação e sub-item (mesmos valores do status do plano).
 * O prazo NÃO é status: a situação do prazo é a tag (`prazo_tag`), exibida e contada à parte.
 */
export type StatusExecucao = StatusPlano;

export const ROTULO_STATUS_EXECUCAO: Record<StatusExecucao, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export const TOKEN_STATUS_EXECUCAO: Record<StatusExecucao, string> = {
  nao_iniciado: "--cor-dado-nao-iniciado",
  em_andamento: "--cor-dado-em-andamento",
  concluido: "--cor-dado-concluida",
};

/**
 * Status de execução de uma ação/sub-item pelo status gravado (o vencimento não muda nada).
 * null = descartada (cancelada/recusada): fica fora dos 3, como o arquivado nos PAs.
 */
export function statusExecucaoAcao(status: StatusAcao): StatusExecucao | null {
  switch (status) {
    case "aguardando_aceite":
    case "aceita":
      return "nao_iniciado";
    case "em_andamento":
    case "bloqueada":
      return "em_andamento";
    case "concluida":
      return "concluido";
    default:
      return null;
  }
}

/** Condição do fluxo da ação, mostrada à parte do status (selo neutro). */
export const CONDICAO_ACAO: Partial<Record<StatusAcao, string>> = {
  aguardando_aceite: "Aguardando aceite",
  bloqueada: "Bloqueada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

/** Categoria da API (contadores e gráficos de ações) → status de execução. */
export const EXECUCAO_DA_CATEGORIA: Record<CategoriaAcao, StatusExecucao> = {
  pendente: "nao_iniciado",
  em_andamento: "em_andamento",
  concluida: "concluido",
};

// Status global (calculado pelas ações). Rascunho e arquivado são condições à parte.
export const ROTULO_STATUS_PLANO: Record<StatusPlano, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

/** Para o histórico: registros antigos ainda citam os status extintos. */
export const ROTULO_STATUS_PLANO_HISTORICO: Record<string, string> = {
  ...ROTULO_STATUS_PLANO,
  rascunho: "Rascunho",
  cancelado: "Cancelado",
};

/** Tag de prazo (separada do status). "Sem prazo definido" é informação neutra. */
export const ROTULO_PRAZO: Record<TagPrazo, string> = {
  em_atraso: "Em atraso",
  a_vencer: "A vencer",
  no_prazo: "No prazo",
  sem_prazo: "Sem prazo definido",
};

export const TOKEN_PRAZO: Record<TagPrazo, string> = {
  em_atraso: "--cor-prazo-em_atraso",
  a_vencer: "--cor-prazo-a_vencer",
  no_prazo: "--cor-prazo-no_prazo",
  sem_prazo: "--cor-prazo-sem_prazo",
};

export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = {
  aguardando_aceite: "Aguardando aceite",
  aceita: "Aceita",
  em_andamento: "Em andamento",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

export const ROTULO_CATEGORIA_ACAO: Record<CategoriaAcao, string> = {
  pendente: ROTULO_STATUS_EXECUCAO.nao_iniciado,
  em_andamento: ROTULO_STATUS_EXECUCAO.em_andamento,
  concluida: ROTULO_STATUS_EXECUCAO.concluido,
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

/**
 * Situação de prazo (Minhas Ações, Calendário, Relatórios): a tag de prazo das abertas + "concluída".
 * Valores da API mantidos (atrasada/vencendo/em_andamento); rótulos e cores = tags de prazo.
 * Ícone do kit + nome, nunca só a cor.
 */
export const SITUACOES_PRAZO = [
  { situacao: "atrasada", icone: "alert", corToken: "--cor-prazo-em_atraso", nome: "Em atraso", plural: "em atraso" },
  { situacao: "vencendo", icone: "clock", corToken: "--cor-prazo-a_vencer", nome: "A vencer", plural: "a vencer" },
  { situacao: "em_andamento", icone: "calendar", corToken: "--cor-prazo-no_prazo", nome: "No prazo", plural: "no prazo" },
  { situacao: "concluida", icone: "checkCircle", corToken: "--cor-dado-concluida", nome: "Concluída", plural: "concluídas" },
] as const;

/** Variável CSS da cor de cada categoria (= cor do status de execução; definidas em styles/tokens.css). */
export const COR_CATEGORIA: Record<CategoriaAcao, string> = {
  pendente: TOKEN_STATUS_EXECUCAO.nao_iniciado,
  em_andamento: TOKEN_STATUS_EXECUCAO.em_andamento,
  concluida: TOKEN_STATUS_EXECUCAO.concluido,
};
