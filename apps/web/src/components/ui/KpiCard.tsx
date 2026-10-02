import type { ReactNode } from "react";

import styles from "./KpiCard.module.css";

export type KpiTom = "primaria" | "sucesso" | "aviso" | "erro" | "info" | "neutro";

const TOKEN_DO_TOM: Record<KpiTom, string> = {
  primaria: "--primary",
  sucesso: "--success",
  aviso: "--warning",
  erro: "--danger",
  info: "--info",
  neutro: "--fg-subtle",
};

interface KpiCardProps {
  valor: ReactNode;
  rotulo: string;
  /** Unidade ao lado do valor (ex.: "%", "dias"). */
  sufixo?: string;
  /** Linha de apoio abaixo do rótulo. */
  dica?: ReactNode;
  tom?: KpiTom;
  /** Variação percentual (ex.: 8 ou -12) mostrada como ↑8% / ↓12%. */
  variacao?: number | null;
  /** Série curta para o mini-gráfico (sparkline). */
  serie?: number[];
  className?: string;
}

function Spark({ dados, cor }: { dados: number[]; cor: string }) {
  if (dados.length < 2) return null;
  const w = 64;
  const h = 28;
  const min = Math.min(...dados);
  const faixa = Math.max(...dados) - min || 1;
  const pontos = dados.map((v, i) => [(i / (dados.length - 1)) * w, h - ((v - min) / faixa) * (h - 4) - 2] as const);
  const d = pontos.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ux, uy] = pontos[pontos.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.spark} aria-hidden="true">
      <path d={d} fill="none" stroke={cor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r="2.5" fill={cor} />
    </svg>
  );
}

/** Ponto de substituição do KpiCard do UIKit: valor em destaque, rótulo, dica, variação e sparkline opcionais. */
export function KpiCard({ valor, rotulo, sufixo, dica, tom = "primaria", variacao, serie, className }: KpiCardProps) {
  const cor = `var(${TOKEN_DO_TOM[tom]})`;
  return (
    <div className={[styles.kpi, className].filter(Boolean).join(" ")}>
      <div className={styles.topo}>
        <div className={styles.valorLinha}>
          <span className={styles.valor}>{valor}</span>
          {sufixo && <span className={styles.sufixo}>{sufixo}</span>}
        </div>
        {serie && <Spark dados={serie} cor={cor} />}
        {variacao != null && (
          <span className={variacao >= 0 ? `${styles.delta} ${styles.deltaAlta}` : `${styles.delta} ${styles.deltaBaixa}`}>
            {variacao >= 0 ? "↑" : "↓"}
            {Math.abs(variacao).toLocaleString("pt-BR")}%
          </span>
        )}
      </div>
      <div>
        <div className={styles.rotulo}>{rotulo}</div>
        {dica && <div className={styles.dica}>{dica}</div>}
      </div>
      <span className={styles.faixa} style={{ background: cor }} aria-hidden="true" />
    </div>
  );
}
