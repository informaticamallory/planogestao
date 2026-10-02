import type { IndicadoresPlano } from "@planogestao/shared-types";

import { COR_CATEGORIA, TOKEN_PRAZO } from "../../../utils/rotulos";
import type { FiltroAcoes } from "./AbaAcoes";
import styles from "./CartoesIndicadoresPlano.module.css";

interface Props {
  indicadores: IndicadoresPlano | undefined;
  /** Clique num cartão de status ou de prazo abre a aba Ações filtrada. */
  onFiltrarAcoes: (filtro: FiltroAcoes | null) => void;
}

export function CartoesIndicadoresPlano({ indicadores: i, onFiltrarAcoes }: Props) {
  const valor = (n: number | undefined) => (n === undefined ? "—" : String(n));
  // Execução (Concluídas, Não iniciadas) e prazo (Em atraso) contados à parte: uma ação
  // não iniciada e vencida entra em "Não iniciadas" e também em "Em atraso".
  const cartoes: { rotulo: string; valor: string; filtro?: FiltroAcoes | null; token?: string; descricao?: string }[] = [
    { rotulo: "Progresso", valor: i ? `${i.progresso}%` : "—", descricao: "Média das ações" },
    { rotulo: "Ações", valor: valor(i?.total_acoes), filtro: null, descricao: i?.descartadas ? `+${i.descartadas} recusada(s)/cancelada(s)` : undefined },
    { rotulo: "Concluídas", valor: valor(i?.concluidas), filtro: "concluida", token: COR_CATEGORIA.concluida },
    { rotulo: "Em atraso", valor: valor(i?.atrasadas), filtro: "em_atraso", token: TOKEN_PRAZO.em_atraso, descricao: "Prazo vencido, não concluídas" },
    { rotulo: "Não iniciadas", valor: valor(i?.pendentes), filtro: "pendente", token: COR_CATEGORIA.pendente, descricao: "Aguardando aceite ou aceitas" },
  ];

  return (
    <div className={styles.cartoes} aria-busy={!i}>
      {cartoes.map((c) => {
        const conteudo = (
          <>
            <span className={styles.rotulo}>
              {c.token && (
                <span className={styles.ponto} style={{ background: `var(${c.token})` }} aria-hidden="true" />
              )}
              {c.rotulo}
            </span>
            <span className={styles.valor}>{c.valor}</span>
            {c.descricao && <span className={styles.descricao}>{c.descricao}</span>}
          </>
        );
        return c.filtro !== undefined ? (
          <button key={c.rotulo} type="button" className={`${styles.cartao} ${styles.clicavel}`} onClick={() => onFiltrarAcoes(c.filtro ?? null)}>
            {conteudo}
          </button>
        ) : (
          <div key={c.rotulo} className={styles.cartao}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}
