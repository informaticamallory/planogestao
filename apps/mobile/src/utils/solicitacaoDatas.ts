import type { ContrapropostaResumo, SolicitacaoResumo } from "@planogestao/shared-types";

import { formatarData, formatarDataHora } from "./formatos";

/** Datas planejadas pedidas numa solicitação (as datas reais de execução não entram em solicitação). Igual ao web. */
type Pedido = Pick<
  SolicitacaoResumo,
  "prazo_anterior" | "novo_prazo_sugerido" | "prazo_inicio_anterior" | "novo_prazo_inicio_sugerido" | "altera_inicio" | "altera_conclusao"
>;

const fmt = (iso: string | null | undefined) => (iso ? formatarData(iso) : "—");

/** "da data de início", "da data de conclusão" ou "das datas de início e conclusão". */
export function camposSolicitacao(s: Pedido): string {
  if (s.altera_inicio && s.altera_conclusao) return "das datas de início e conclusão";
  return s.altera_inicio ? "da data de início" : "da data de conclusão";
}

/** Atual e solicitada, só das datas pedidas. */
export function linhasSolicitacao(s: Pedido): { rotulo: string; valor: string }[] {
  const linhas = [];
  if (s.altera_inicio) {
    linhas.push({ rotulo: "Data de início atual", valor: fmt(s.prazo_inicio_anterior) });
    linhas.push({ rotulo: "Data de início solicitada", valor: fmt(s.novo_prazo_inicio_sugerido) });
  }
  if (s.altera_conclusao) {
    linhas.push({ rotulo: "Data de conclusão atual", valor: fmt(s.prazo_anterior) });
    linhas.push({ rotulo: "Data de conclusão solicitada", valor: fmt(s.novo_prazo_sugerido) });
  }
  return linhas;
}

/** Versão curta para listas: "Início 10/11/2026 → 12/11/2026 · Conclusão 20/11/2026 → 25/11/2026". */
export function resumoMudancas(s: Pedido): string {
  const partes = [];
  if (s.altera_inicio) partes.push(`Início ${fmt(s.prazo_inicio_anterior)} → ${fmt(s.novo_prazo_inicio_sugerido)}`);
  if (s.altera_conclusao) partes.push(`Conclusão ${fmt(s.prazo_anterior)} → ${fmt(s.novo_prazo_sugerido)}`);
  return partes.join(" · ");
}

export function alertaSolicitacao(s: Pedido, fimEstimadoPlano: string): string | null {
  return s.altera_conclusao && s.novo_prazo_sugerido > fimEstimadoPlano
    ? `A data de conclusão solicitada ultrapassa o término estimado do plano, em ${formatarData(fimEstimadoPlano)}.`
    : null;
}

type Contraproposta = Pick<
  ContrapropostaResumo,
  "prazo_inicio_vigente" | "prazo_vigente" | "novo_prazo_inicio" | "novo_prazo" | "altera_inicio" | "altera_conclusao"
>;

/** Uma linha por data negociada: vigente × solicitada × proposta pelo gestor ("sem alteração" quando não mexe). */
export function comparacaoContraproposta(s: Pedido, c: Contraproposta): { campo: string; vigente: string; solicitada: string; proposta: string }[] {
  const linhas = [];
  if (s.altera_inicio || c.altera_inicio) {
    linhas.push({
      campo: "Data de início",
      vigente: fmt(c.prazo_inicio_vigente),
      solicitada: s.altera_inicio ? fmt(s.novo_prazo_inicio_sugerido) : "sem alteração",
      proposta: c.altera_inicio ? fmt(c.novo_prazo_inicio) : "sem alteração",
    });
  }
  if (s.altera_conclusao || c.altera_conclusao) {
    linhas.push({
      campo: "Data de conclusão",
      vigente: fmt(c.prazo_vigente),
      solicitada: s.altera_conclusao ? fmt(s.novo_prazo_sugerido) : "sem alteração",
      proposta: c.altera_conclusao ? fmt(c.novo_prazo) : "sem alteração",
    });
  }
  return linhas;
}

/** A contraproposta no formato do pedido (para reaproveitar o resumo "Início … → … · Conclusão … → …"). */
export const comoPedido = (c: Contraproposta): Pedido => ({
  prazo_anterior: c.prazo_vigente,
  novo_prazo_sugerido: c.novo_prazo,
  prazo_inicio_anterior: c.prazo_inicio_vigente,
  novo_prazo_inicio_sugerido: c.novo_prazo_inicio,
  altera_inicio: c.altera_inicio,
  altera_conclusao: c.altera_conclusao,
});

export function alertaContraproposta(c: Contraproposta, fimEstimadoPlano: string): string | null {
  return c.altera_conclusao && c.novo_prazo > fimEstimadoPlano
    ? `A data de conclusão proposta ultrapassa o término estimado do plano, em ${formatarData(fimEstimadoPlano)}.`
    : null;
}

/** Situação da negociação (separada do status de execução da ação). */
export const ROTULO_SITUACAO: Record<SolicitacaoResumo["situacao"], string> = {
  aguardando_gestor: "Aguardando análise do gestor",
  aguardando_responsavel: "Aguardando resposta do responsável",
  aprovada: "Aprovada",
  recusada: "Recusada",
  acordo: "Acordo concluído",
};

export const ROTULO_CONTRAPROPOSTA: Record<ContrapropostaResumo["status"], string> = {
  pendente: "Aguardando resposta",
  aceita: "Aceita",
  nao_aceita: "Não aceita",
  substituida: "Substituída",
  encerrada: "Encerrada",
};

/** "28/10/2026 às 09:03" (fuso do aparelho). */
export const formatarMomento = (isoInstante: string) => formatarDataHora(isoInstante).replace(" ", " às ");
