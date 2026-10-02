import type { ReactNode, TableHTMLAttributes } from "react";

import styles from "./Table.module.css";

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
  /** Legenda acessível (pode ficar oculta com className "sr-only" no próprio <caption>). */
  legenda?: ReactNode;
  /** Sem rolagem horizontal própria (quando o contêiner já rola). */
  semRolagem?: boolean;
};

/**
 * Ponto de substituição da tabela do UIKit. Cabeçalho e células continuam nativos
 * (<thead>/<tbody>/<th>/<td>) para manter a semântica. Convenções de célula:
 * - `data-numerico`: alinhado à direita, algarismos tabulares;
 * - `data-acoes`: coluna de botões, alinhada à direita;
 * - `<tr data-inativo>`: linha esmaecida.
 */
export function Table({ children, legenda, semRolagem, className, ...props }: TableProps) {
  const tabela = (
    <table className={[styles.tabela, className].filter(Boolean).join(" ")} {...props}>
      {legenda && <caption className={styles.legenda}>{legenda}</caption>}
      {children}
    </table>
  );
  return semRolagem ? tabela : <div className={styles.rolagem}>{tabela}</div>;
}
