import type { ReactNode } from "react";

import styles from "./Field.module.css";

interface FieldProps {
  /** id do controle; a mensagem de erro recebe o id `${id}-erro` (use em aria-describedby). */
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  aviso?: string | null;
  ajuda?: string;
  className?: string;
  children: ReactNode;
}

/** Ponto de substituição do form-field do UIKit: rótulo, obrigatório, ajuda, erro e aviso em volta de um Input/Select/Textarea. */
export function Field({ id, rotulo, obrigatorio, erro, aviso, ajuda, className, children }: FieldProps) {
  return (
    <div className={`${styles.campo} ${className ?? ""}`}>
      <label htmlFor={id} className={styles.rotulo}>
        {rotulo}
        {obrigatorio && (
          <span className={styles.obrigatorio} aria-hidden="true">
            {" "}*
          </span>
        )}
      </label>
      {children}
      {ajuda && !erro && <span className={styles.ajuda}>{ajuda}</span>}
      {erro && (
        <span id={`${id}-erro`} className={styles.erro} role="alert">
          {erro}
        </span>
      )}
      {aviso && !erro && <span className={styles.aviso}>{aviso}</span>}
    </div>
  );
}

/** Props de acessibilidade para o controle dentro de um <Field>. */
export function fieldAria(id: string, erro?: string) {
  return { id, "aria-invalid": erro ? true : undefined, "aria-describedby": erro ? `${id}-erro` : undefined };
}
