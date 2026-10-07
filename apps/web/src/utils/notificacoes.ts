import type { NotificacaoItem } from "@planogestao/shared-types";

import type { IconName } from "../components/ui/Icon";

export interface TipoNotificacao {
  tipo: string;
  rotulo: string;
  /** Ícone do kit (nunca emoji) e cor de destaque — sempre com o rótulo em texto. */
  icone: IconName;
  corToken: string;
}

export const TIPOS_NOTIFICACAO: TipoNotificacao[] = [
  { tipo: "resumo_semanal", rotulo: "Resumo semanal", icone: "barChart", corToken: "--info" },
  { tipo: "acao_atribuida", rotulo: "Ação atribuída", icone: "pin", corToken: "--primary" },
  { tipo: "acao_vencendo", rotulo: "Prazo próximo", icone: "clock", corToken: "--cor-dado-vencendo" },
  { tipo: "prazo_alterado", rotulo: "Alteração de prazo", icone: "calendar", corToken: "--info" },
  { tipo: "acao_atrasada", rotulo: "Ação em atraso", icone: "alert", corToken: "--cor-dado-atrasada" },
  { tipo: "acao_concluida", rotulo: "Ação concluída", icone: "checkCircle", corToken: "--cor-dado-concluida" },
  { tipo: "dependencia_liberada", rotulo: "Dependência liberada", icone: "zap", corToken: "--primary" },
  { tipo: "solicitacao_prazo", rotulo: "Solicitação de prazo", icone: "refresh", corToken: "--info" },
  { tipo: "resposta_solicitacao_prazo", rotulo: "Resposta de prazo", icone: "mail", corToken: "--info" },
  { tipo: "plano_vencendo", rotulo: "Plano a vencer", icone: "hourglass", corToken: "--cor-dado-vencendo" },
  { tipo: "plano_concluido", rotulo: "Plano concluído", icone: "flag", corToken: "--cor-dado-concluida" },
  { tipo: "plano_sem_atualizacao", rotulo: "Plano sem atualização", icone: "fileWarning", corToken: "--cor-dado-vencendo" },
];

export const infoTipo = (tipo: string): TipoNotificacao =>
  TIPOS_NOTIFICACAO.find((t) => t.tipo === tipo) ?? { tipo, rotulo: tipo, icone: "bell", corToken: "--fg-muted" };

/** Para onde a notificação leva (ação ou plano referenciado). */
export function linkDaNotificacao(n: Pick<NotificacaoItem, "referencia_tipo" | "referencia_id">): string | null {
  if (n.referencia_id === null) return null;
  if (n.referencia_tipo === "acao") return `/acoes/${n.referencia_id}`;
  if (n.referencia_tipo === "plano") return `/planos/${n.referencia_id}`;
  return null;
}
