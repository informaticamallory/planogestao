import type { ContrapropostaResumo, SolicitacaoResumo } from "@planogestao/shared-types";

import { formatarData, formatarDataDoInstante } from "./datas";

/** Datas planejadas pedidas numa solicitação (as datas reais de execução não entram em solicitação). */
type Pedido = Pick<
  SolicitacaoResumo,
  "prazo_anterior" | "novo_prazo_sugerido" | "prazo_inicio_anterior" | "novo_prazo_inicio_sugerido" | "altera_inicio" | "altera_conclusao"
>;

const fmt = (iso: string | null | undefined) => (iso ? formatarData(iso) : "—");
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "o início", "a conclusão" ou "as datas de início e conclusão" (frase "Fulano solicitou mudar …"). */
export function alvoSolicitacao(s: Pedido): string {
  if (s.altera_inicio && s.altera_conclusao) return "as datas de início e conclusão";
  return s.altera_inicio ? "o início" : "a conclusão";
}

/** "Solicitação de alteração do início" / "da conclusão" / "das datas". */
export function tituloSolicitacao(s: Pedido): string {
  if (s.altera_inicio && s.altera_conclusao) return "Solicitação de alteração das datas";
  return s.altera_inicio ? "Solicitação de alteração do início" : "Solicitação de alteração da conclusão";
}

/** De → Para, uma linha por data pedida. */
export function mudancasSolicitacao(s: Pedido): { rotulo: string; de: string; para: string }[] {
  const linhas = [];
  if (s.altera_inicio) linhas.push({ rotulo: "Início", de: fmt(s.prazo_inicio_anterior), para: fmt(s.novo_prazo_inicio_sugerido) });
  if (s.altera_conclusao) linhas.push({ rotulo: "Conclusão", de: fmt(s.prazo_anterior), para: fmt(s.novo_prazo_sugerido) });
  return linhas;
}

/** Versão em uma linha, para listas: "Início — De: 30/10/2026 → Para: 05/11/2026 · Conclusão — De: … → Para: …". */
export function resumoMudancas(s: Pedido): string {
  return mudancasSolicitacao(s)
    .map((l) => `${l.rotulo} — De: ${l.de} → Para: ${l.para}`)
    .join(" · ");
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

/** "28/10/2026 às 09:03" (horário local). */
export const formatarMomento = (isoInstante: string) =>
  `${formatarDataDoInstante(isoInstante)} às ${fmtHora.format(new Date(isoInstante))}`;
