/**
 * Ajuste do prazo inicial estimado ao marcar um pré-requisito ("Depende da conclusão de").
 * Regra pura (sem React), usada pelo formulário de ações/subações e pelo "Editar planejamento".
 */

export interface PreRequisitoPrazo {
  /** "Ação 1", "Subação 1.2"… */
  rotulo: string;
  descricao: string;
  /** Prazo de conclusão previsto (AAAA-MM-DD); vazio/null quando ainda não preenchido no formulário. */
  prazo: string | null;
}

export type AnaliseAjuste =
  /** Algum pré-requisito sem prazo de conclusão: não dá para calcular a referência. */
  | { tipo: "sem_prazo"; faltando: PreRequisitoPrazo[] }
  /** A referência cai depois do prazo de conclusão do item: os prazos precisam ser revistos. */
  | { tipo: "conflito"; data: string; origem: PreRequisitoPrazo; prazoItem: string }
  /** O prazo inicial já é a referência: nada a perguntar. */
  | { tipo: "igual"; data: string; origem: PreRequisitoPrazo }
  | { tipo: "ajustavel"; data: string; origem: PreRequisitoPrazo };

/**
 * `preRequisitos`: TODOS os marcados, já incluindo o recém-marcado. A referência é o maior prazo de
 * conclusão entre eles. Datas ISO (AAAA-MM-DD) comparam como texto.
 */
export function analisarAjuste(preRequisitos: PreRequisitoPrazo[], prazoInicio: string, prazoItem: string): AnaliseAjuste {
  const faltando = preRequisitos.filter((p) => !p.prazo);
  if (faltando.length > 0) return { tipo: "sem_prazo", faltando };
  const origem = preRequisitos.reduce((maior, p) => (p.prazo! > maior.prazo! ? p : maior));
  const data = origem.prazo!;
  if (prazoItem && data > prazoItem) return { tipo: "conflito", data, origem, prazoItem };
  if (data === prazoInicio) return { tipo: "igual", data, origem };
  return { tipo: "ajustavel", data, origem };
}
