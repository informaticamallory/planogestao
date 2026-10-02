import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

import styles from "./Button.module.css";

export type ButtonVariante = "primaria" | "secundaria" | "perigo" | "link" | "icone";
export type ButtonTamanho = "md" | "sm";

interface Aparencia {
  variante?: ButtonVariante;
  tamanho?: ButtonTamanho;
  /** Ocupa toda a largura do contêiner. */
  bloco?: boolean;
}

export function classesDoBotao({ variante = "secundaria", tamanho = "md", bloco }: Aparencia, extra?: string) {
  return [styles.botao, styles[variante], tamanho === "sm" && styles.sm, bloco && styles.bloco, extra].filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Aparencia;

/**
 * Ponto de substituição do botão do UIKit. `type` padrão é "button" (nunca envia formulário sem querer).
 * Variante "icone": botão só com símbolo — exige `aria-label`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante, tamanho, bloco, className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={classesDoBotao({ variante, tamanho, bloco }, className)} {...props} />;
});

/** Link de navegação com aparência de botão (ex.: "+ Novo plano"). */
export function ButtonLink({ variante, tamanho, bloco, className, ...props }: LinkProps & Aparencia) {
  return <Link className={classesDoBotao({ variante, tamanho, bloco }, className)} {...props} />;
}
