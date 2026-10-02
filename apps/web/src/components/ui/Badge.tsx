import type { ReactNode } from "react";

import styles from "./Badge.module.css";

export type BadgeTom = "neutro" | "primaria" | "sucesso" | "aviso" | "erro" | "info";

interface BadgeProps {
  children: ReactNode;
  /** Tom semântico do kit (fundo -soft + texto na cor cheia). */
  tom?: BadgeTom;
  /**
   * Token de cor de dados (ex.: "--cor-status-concluida"): fundo suave e texto nessa cor, com ponto.
   * A cor nunca é a única informação — o texto do badge sempre acompanha.
   */
  corToken?: string;
  /** Ponto colorido antes do texto. */
  ponto?: boolean;
  tamanho?: "md" | "sm";
  negrito?: boolean;
  title?: string;
}

/** Ponto de substituição do badge do UIKit (Mallory DS: tons default/primary/success/warning/danger/info + dot). */
export function Badge({ children, tom = "neutro", corToken, ponto, tamanho = "md", negrito, title }: BadgeProps) {
  const cor = corToken ? `var(${corToken})` : undefined;
  const comPonto = ponto ?? !!cor;
  return (
    <span
      className={[styles.badge, !cor && styles[tom], tamanho === "sm" && styles.sm, negrito && styles.negrito]
        .filter(Boolean)
        .join(" ")}
      style={cor ? { color: `color-mix(in oklab, ${cor} 75%, var(--fg))`, background: `color-mix(in oklab, ${cor} 13%, transparent)` } : undefined}
      title={title}
    >
      {comPonto && <span className={styles.ponto} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Vários badges lado a lado, com quebra de linha. */
export function BadgeGroup({ children }: { children: ReactNode }) {
  return <span className={styles.grupo}>{children}</span>;
}
