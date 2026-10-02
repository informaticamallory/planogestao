import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import styles from "./Input.module.css";

interface Densidade {
  /** Largura do conteúdo em vez de 100% (barras de filtro). */
  compacto?: boolean;
}

const classes = (compacto: boolean | undefined, ...extra: (string | undefined)[]) =>
  [styles.controle, compacto && styles.compacto, ...extra].filter(Boolean).join(" ");

export type InputProps = InputHTMLAttributes<HTMLInputElement> & Densidade;

/** Ponto de substituição do campo de texto do UIKit (text, email, password, number, date, search...). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ compacto, className, ...props }, ref) {
  return <input ref={ref} className={classes(compacto, className)} {...props} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Densidade & {
    /**
     * Começa com uma linha e acompanha o texto: cresce com quebras (automáticas ou Enter), diminui ao apagar
     * e se ajusta ao valor carregado, à colagem e à mudança de largura. Sem rolagem interna.
     */
    autoAjuste?: boolean;
  };

/** Ajusta a altura do textarea ao conteúdo (borda incluída; o mínimo de uma linha vem do CSS). */
export function ajustarAltura(el: HTMLTextAreaElement) {
  if (!el.isConnected || el.offsetParent === null) return; // oculto (ex.: aba fechada): ajusta ao aparecer
  el.style.height = "auto";
  const bordas = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + bordas}px`;
  // Arredondamento de subpixel pode deixar 1px de fora: completa a diferença.
  const falta = el.scrollHeight - el.clientHeight;
  if (falta > 0) el.style.height = `${el.offsetHeight + falta}px`;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { compacto, className, autoAjuste = false, onInput, ...props },
  ref,
) {
  const interno = useRef<HTMLTextAreaElement | null>(null);
  const juntarRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      interno.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  // Valor controlado mudou (digitação, colagem, registro carregado): mede antes de pintar.
  useLayoutEffect(() => {
    if (autoAjuste && interno.current) ajustarAltura(interno.current);
  }, [autoAjuste, props.value]);

  // Largura mudou (tela redimensionada, menu recolhido) ou o campo apareceu (aba aberta): mede de novo.
  // Só a largura dispara: a altura muda pelo próprio ajuste.
  useLayoutEffect(() => {
    const el = interno.current;
    if (!autoAjuste || !el) return;
    let largura = -1;
    const observador = new ResizeObserver(([entrada]) => {
      const atual = entrada?.contentRect.width ?? 0;
      if (atual !== largura) {
        largura = atual;
        ajustarAltura(el);
      }
    });
    observador.observe(el);
    // A fonte do sistema pode carregar depois do 1º desenho e mudar a quebra das linhas.
    void document.fonts?.ready.then(() => ajustarAltura(el));
    return () => observador.disconnect();
  }, [autoAjuste]);

  return (
    <textarea
      {...props}
      ref={juntarRef}
      rows={autoAjuste ? 1 : props.rows}
      className={classes(compacto, styles.textarea, autoAjuste ? styles.autoAjuste : undefined, className)}
      // Também cobre o uso não controlado.
      onInput={(e: FormEvent<HTMLTextAreaElement>) => {
        if (autoAjuste) ajustarAltura(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Texto ao lado da caixa. Sem ele, informe `aria-label`. */
  rotulo?: ReactNode;
};

/** Caixa de seleção com rótulo clicável. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ rotulo, className, ...props }, ref) {
  return (
    <label className={[styles.checkbox, className].filter(Boolean).join(" ")}>
      <input ref={ref} type="checkbox" {...props} />
      {rotulo}
    </label>
  );
});
