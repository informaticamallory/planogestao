import type { Prioridade, StatusAcao, StatusPlano, TagPrazo } from "@planogestao/shared-types";

import {
  CONDICAO_ACAO,
  ROTULO_PRAZO,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_EXECUCAO,
  SITUACOES_PRAZO,
  TOKEN_PRAZO,
  TOKEN_STATUS_EXECUCAO,
  statusExecucaoAcao,
} from "../../utils/rotulos";
import { Badge, BadgeGroup } from "./Badge";
import { Icon } from "./Icon";
import styles from "./StatusBadges.module.css";

/** Badges de domínio: só decidem texto e cor; a aparência é do Badge. */

export function PriorityBadge({ prioridade }: { prioridade: Prioridade }) {
  // Prioridade não é categoria de dados: sem cor; "Crítica" ganha destaque tipográfico.
  return <Badge negrito={prioridade === "critica"}>Prioridade {ROTULO_PRIORIDADE[prioridade].toLowerCase()}</Badge>;
}

/**
 * Tag de prazo (separada do status): vermelho = em atraso, laranja = a vencer, verde = no prazo,
 * neutra = sem prazo definido. Concluídos e descartados não têm tag (null → nada).
 */
export function PrazoTag({ tag }: { tag: TagPrazo | null | undefined }) {
  if (!tag) return null;
  return (
    <Badge corToken={TOKEN_PRAZO[tag]} negrito={tag === "em_atraso"}>
      {ROTULO_PRAZO[tag]}
    </Badge>
  );
}

/**
 * Ação/sub-item: status de execução (Não iniciado, Em andamento, Concluído) + tag de prazo ao lado.
 * A condição do fluxo (aguardando aceite, bloqueada) vem num selo neutro à parte. Canceladas e
 * recusadas ficam fora dos 3 status: só o selo da condição, sem tag de prazo.
 */
export function ActionStatusBadge({
  status, prazoTag, arquivo,
}: { status: StatusAcao; prazoTag?: TagPrazo | null; arquivo?: "plano" | "acao" | null }) {
  const execucao = statusExecucaoAcao(status);
  const condicao = CONDICAO_ACAO[status];
  return (
    <BadgeGroup>
      {execucao && <Badge corToken={TOKEN_STATUS_EXECUCAO[execucao]}>{ROTULO_STATUS_EXECUCAO[execucao]}</Badge>}
      {condicao && <Badge corToken={execucao ? undefined : `--cor-status-${status}`}>{condicao}</Badge>}
      {/* Arquivado: no lugar da situação de prazo (status original preservado ao lado). */}
      {arquivo ? (
        <Badge>{arquivo === "plano" ? "Plano arquivado" : "Arquivada"}</Badge>
      ) : (
        execucao && execucao !== "concluido" && <PrazoTag tag={prazoTag} />
      )}
    </BadgeGroup>
  );
}

/** Status global do plano (Não iniciado, Em andamento, Concluído) + tag de prazo ao lado, se informada. */
export function PlanStatusBadge({ status, prazoTag }: { status: StatusPlano; prazoTag?: TagPrazo | null }) {
  return (
    <BadgeGroup>
      <Badge corToken={TOKEN_STATUS_EXECUCAO[status]}>{ROTULO_STATUS_EXECUCAO[status]}</Badge>
      {status !== "concluido" && <PrazoTag tag={prazoTag} />}
    </BadgeGroup>
  );
}

type Situacao = (typeof SITUACOES_PRAZO)[number]["situacao"];

/** Situação de prazo (atrasada, vencendo, em andamento, concluída): ícone colorido + nome. */
export function DeadlineStatusLabel({ situacao, soIcone, texto }: { situacao: Situacao; soIcone?: boolean; texto?: string }) {
  const s = SITUACOES_PRAZO.find((x) => x.situacao === situacao)!;
  return (
    <span className={styles.situacao}>
      <Icon name={s.icone} size={14} strokeWidth={2.2} color={`var(${s.corToken})`} />
      {soIcone ? <span className="sr-only">{texto ?? s.nome}</span> : (texto ?? s.nome)}
    </span>
  );
}
