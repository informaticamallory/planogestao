import type { AcaoHistoricoItem, StatusAcao } from "@planogestao/shared-types";

import { formatarData } from "./formatos";
import { textoStatusAcao } from "./rotulos";

/** Mesmas frases do web (apps/web/src/utils/historico.ts → descreverEventoAcao), sem o nome do autor. */
const CAMPOS_ACAO: Record<string, string> = {
  status: "o status",
  progresso: "o progresso",
  prazo: "o prazo de conclusão",
  prazo_inicio: "o prazo inicial estimado",
  area: "a área",
  setor: "a função/cargo",
  depende_de: "os pré-requisitos",
  responsavel: "o responsável",
  responsavel_id: "o responsável",
  observacao: "a observação",
};

const LIMITE_TEXTO = 80;
const STATUS_ACAO: StatusAcao[] = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada", "concluida", "recusada", "cancelada"];

function valorLegivel(campo: string | null, valor: string | null): string {
  if (valor === null || valor === "") return "vazio";
  // Status de execução + condição ("Não iniciado · Aguardando aceite"); valor desconhecido sai cru.
  if (campo === "status") return STATUS_ACAO.includes(valor as StatusAcao) ? textoStatusAcao(valor as StatusAcao) : valor;
  if (campo === "progresso") return `${valor}%`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarData(valor);
  return valor.length > LIMITE_TEXTO ? `“${valor.slice(0, LIMITE_TEXTO)}…”` : `“${valor}”`;
}

function fraseEventoAcao(e: AcaoHistoricoItem): string {
  const de = (v: string | null) => valorLegivel(e.campo_alterado, v);
  const motivo = e.detalhe ? ` — ${e.detalhe}` : "";

  if (e.evento === "criacao") {
    if (e.campo_alterado === "progresso") return `definiu o progresso inicial em ${de(e.valor_novo)}`;
    if (e.campo_alterado === "depende_de") return `definiu os pré-requisitos: ${e.valor_novo ?? ""}`;
    // "Subação de"/"Sub-item de": o detalhe vem do backend (pode estar nos dois formatos).
    const tipo = /^Sub-?(item|ação) de/i.test(e.detalhe ?? "") ? "o sub-item" : "a ação";
    return `criou ${tipo}${e.valor_novo ? ` (${de(e.valor_novo)})` : ""}${motivo}`;
  }
  if (e.campo_alterado === "subacao") return `criou o sub-item ${e.valor_novo ?? ""}`;
  if (e.campo_alterado === "depende_de") return `alterou os pré-requisitos de ${e.valor_anterior ?? "nenhum"} para ${e.valor_novo ?? "nenhum"}`;
  if (e.evento === "comentario") return `comentou${motivo}`;
  if (e.evento === "solicitacao") return `solicitou alterar o prazo de ${de(e.valor_anterior)} para ${de(e.valor_novo)}${motivo}`;
  if (e.evento === "resposta_solicitacao") {
    const aprovada = e.detalhe?.startsWith("Aprovada");
    const justificativa = e.detalhe?.includes(":") ? ` — ${e.detalhe.slice(e.detalhe.indexOf(":") + 1).trim()}` : "";
    return `${aprovada ? "aprovou" : "recusou"} a alteração de prazo para ${de(e.valor_novo)}${justificativa}`;
  }
  const campo = CAMPOS_ACAO[e.campo_alterado ?? ""] ?? e.campo_alterado;
  if (e.campo_alterado === "observacao") return `atualizou a observação: ${de(e.valor_novo)}`;
  return `alterou ${campo} de ${de(e.valor_anterior)} para ${de(e.valor_novo)}${motivo}`;
}

/**
 * Textos gravados antes da troca de nome ("Subação de …", "Subação 1.2 — …", "Subação criada.") exibidos
 * com o nome atual. Só muda a exibição: o histórico gravado continua como está.
 */
export function comNomeAtual(texto: string): string {
  return texto.replace(/Subação criada/g, "Sub-item criado").replace(/Subação(?=\s+(?:\d|de\s))/g, "Sub-item");
}

export const descreverEventoAcao = (e: AcaoHistoricoItem) => comNomeAtual(fraseEventoAcao(e));
