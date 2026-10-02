import type { EventoTimeline, Prioridade, StatusAcao, StatusPlano } from "@planogestao/shared-types";

import { formatarData } from "./datas";
import { ROTULO_PRIORIDADE, ROTULO_STATUS_ACAO, ROTULO_STATUS_PLANO_HISTORICO } from "./rotulos";

const CAMPOS_PLANO: Record<string, string> = {
  nome: "o nome",
  data_inicio_estimado: "o início estimado",
  data_fim_estimado: "o fim estimado",
  prioridade: "a prioridade",
  status: "o status",
  rascunho: "o rascunho",
  tipo: "o tipo",
  origem: "a origem",
  area: "a área",
  setor: "o setor",
  responsavel: "o responsável",
  descricao: "a descrição",
  descricao_problema: "o problema identificado",
  objetivo: "o objetivo",
  causa: "a causa",
  evidencias: "as evidências",
  observacoes: "as observações",
};

const CAMPOS_ACAO: Record<string, string> = {
  status: "o status",
  progresso: "o progresso",
  prazo: "o prazo de conclusão",
  prazo_inicio: "o prazo inicial estimado",
  area: "a área",
  setor: "o setor",
  depende_de: "os pré-requisitos",
  responsavel_id: "o responsável",
  observacao: "a observação",
};

const LIMITE_TEXTO = 80;

type EventoComCampo = Pick<EventoTimeline, "campo_alterado"> & { origem?: EventoTimeline["origem"] };

function valorLegivel(e: EventoComCampo, valor: string | null): string {
  if (valor === null || valor === "") return "vazio";
  const campo = e.campo_alterado;
  if (campo === "status") {
    // Plano: inclui os status extintos (rascunho/cancelado), citados em registros antigos.
    const rotulos: Record<string, string> = e.origem === "plano" ? ROTULO_STATUS_PLANO_HISTORICO : ROTULO_STATUS_ACAO;
    return rotulos[valor as StatusPlano & StatusAcao] ?? valor;
  }
  if (campo === "prioridade") return ROTULO_PRIORIDADE[valor as Prioridade] ?? valor;
  if (campo === "progresso") return `${valor}%`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarData(valor);
  return valor.length > LIMITE_TEXTO ? `“${valor.slice(0, LIMITE_TEXTO)}…”` : `“${valor}”`;
}

/** Autor do evento: o usuário, ou "Sistema" nas alterações automáticas (ex.: plano iniciado na 1ª ação aceita). */
export const autorDoEvento = (e: Pick<EventoTimeline, "usuario">) => e.usuario?.nome ?? "Sistema";

/** Frase do evento, sem o nome de quem fez (exibido à parte). */
function fraseEvento(e: EventoTimeline): string {
  if (e.origem === "anexo") return `enviou o anexo “${e.anexo_nome}”`;

  if (e.origem === "plano") {
    if (e.evento === "criacao") {
      if (e.campo_alterado === "rascunho") return "salvou o plano como rascunho";
      return `criou o plano (${valorLegivel(e, e.valor_novo)})`;
    }
    if (e.evento === "arquivamento") return e.motivo ? `arquivou o plano — ${e.motivo}` : "arquivou o plano";
    if (e.campo_alterado === "rascunho") return "liberou o plano (deixou de ser rascunho)";
    if (e.evento === "desarquivamento") return "desarquivou o plano";
    const campo = CAMPOS_PLANO[e.campo_alterado ?? ""] ?? e.campo_alterado;
    const frase = `alterou ${campo} de ${valorLegivel(e, e.valor_anterior)} para ${valorLegivel(e, e.valor_novo)}`;
    // Alteração automática (autor "Sistema"): o motivo explica por que o status mudou sozinho.
    return e.motivo ? `${frase} — motivo: ${e.motivo}` : frase;
  }

  return descreverEventoAcao({ ...e, detalhe: null }, e.acao?.nome);
}

/**
 * Frase de um evento de ação. `nomeAcao` identifica a ação quando a frase aparece fora
 * do detalhe dela (timeline do plano); no detalhe da própria ação, fica vazio.
 */
function fraseEventoAcao(
  e: Pick<EventoTimeline, "evento" | "campo_alterado" | "valor_anterior" | "valor_novo"> & { detalhe: string | null },
  nomeAcao?: string,
): string {
  const ev = { ...e, origem: "acao" as const };
  const de = (v: string | null) => valorLegivel(ev, v);
  const sufixo = nomeAcao ? ` da ação “${nomeAcao}”` : "";
  const motivo = e.detalhe ? ` — ${e.detalhe}` : "";

  if (e.evento === "criacao") {
    if (e.campo_alterado === "progresso") return `definiu o progresso inicial${sufixo} em ${de(e.valor_novo)}`;
    if (e.campo_alterado === "depende_de") return `definiu os pré-requisitos${sufixo}: ${e.valor_novo ?? ""}`;
    // Registros antigos dizem "Subação de …"; os novos, "Sub-item de …".
    const tipo = e.detalhe?.startsWith("Subação de") || e.detalhe?.startsWith("Sub-item de") ? "o sub-item" : "a ação";
    return `criou ${tipo}${nomeAcao ? ` “${nomeAcao}”` : ""}${e.valor_novo ? ` (${de(e.valor_novo)})` : ""}${motivo}`;
  }
  if (e.campo_alterado === "subacao") return `criou o sub-item ${e.valor_novo ?? ""}${sufixo}`;
  if (e.campo_alterado === "depende_de") {
    return `alterou os pré-requisitos${sufixo} de ${e.valor_anterior ?? "nenhum"} para ${e.valor_novo ?? "nenhum"}`;
  }
  if (e.evento === "comentario") return `comentou${sufixo}${motivo}`;
  if (e.evento === "solicitacao") {
    return `solicitou alterar o prazo${sufixo} de ${de(e.valor_anterior)} para ${de(e.valor_novo)}${motivo}`;
  }
  if (e.evento === "resposta_solicitacao") {
    const aprovada = e.detalhe?.startsWith("Aprovada");
    const justificativa = e.detalhe?.includes(":") ? ` — ${e.detalhe.slice(e.detalhe.indexOf(":") + 1).trim()}` : "";
    return `${aprovada ? "aprovou" : "recusou"} a alteração de prazo${sufixo} para ${de(e.valor_novo)}${justificativa}`;
  }
  const campo = CAMPOS_ACAO[e.campo_alterado ?? ""] ?? e.campo_alterado;
  if (e.campo_alterado === "observacao") return `atualizou a observação${sufixo}: ${de(e.valor_novo)}`;
  return `alterou ${campo}${sufixo} de ${de(e.valor_anterior)} para ${de(e.valor_novo)}${motivo}`;
}

/**
 * Textos gravados antes da troca de nome ("Subação de …", "Subação 1.2 — …", "Subação criada.") exibidos
 * com o nome atual. Só muda a exibição: o histórico gravado continua como está.
 */
export function comNomeAtual(texto: string): string {
  return texto.replace(/Subação criada/g, "Sub-item criado").replace(/Subação(?=\s+(?:\d|de\s))/g, "Sub-item");
}

/** Frase do evento, sem o nome de quem fez (exibido à parte). */
export const descreverEvento = (e: EventoTimeline) => comNomeAtual(fraseEvento(e));

/** Frase de um evento de ação (ver `fraseEventoAcao`). */
export const descreverEventoAcao = (...args: Parameters<typeof fraseEventoAcao>) => comNomeAtual(fraseEventoAcao(...args));
