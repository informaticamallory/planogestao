import { forwardRef, type SelectHTMLAttributes } from "react";

import styles from "./Input.module.css";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Largura do conteúdo em vez de 100% (barras de filtro). */
  compacto?: boolean;
};

/** Ponto de substituição do select do UIKit. As opções continuam como <option> nativos. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ compacto, className, ...props }, ref) {
  return <select ref={ref} className={[styles.controle, compacto && styles.compacto, className].filter(Boolean).join(" ")} {...props} />;
});
