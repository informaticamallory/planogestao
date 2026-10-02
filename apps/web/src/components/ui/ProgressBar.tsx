import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  /** 0 a 100 (pode ter casas decimais). */
  valor: number;
  rotulo: string;
  /** Token de cor do preenchimento (padrão: cor primária). */
  corToken?: string;
}

/** Ponto de substituição da barra de progresso do UIKit. O percentual aparece em texto ao lado (pt-BR). */
export function ProgressBar({ valor, rotulo, corToken }: ProgressBarProps) {
  const limitado = Math.max(0, Math.min(100, valor));
  return (
    <div className={styles.barraProgresso}>
      <div
        className={styles.trilho}
        role="progressbar"
        aria-label={rotulo}
        aria-valuenow={limitado}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={styles.preenchimento}
          style={{ width: `${limitado}%`, ...(corToken ? { background: `var(${corToken})` } : {}) }}
        />
      </div>
      <span className={styles.valor}>{limitado.toLocaleString("pt-BR")}%</span>
    </div>
  );
}
