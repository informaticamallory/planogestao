import styles from "./CarregandoTela.module.css";

export function CarregandoTela() {
  return (
    <div className={styles.carregandoTela} role="status" aria-live="polite">
      Carregando…
    </div>
  );
}
