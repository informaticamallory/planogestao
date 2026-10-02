import styles from "./PaginaSimples.module.css";

/** Página provisória para itens do menu cujas telas serão feitas nas próximas fases. */
export function EmConstrucaoPage({ titulo }: { titulo: string }) {
  return (
    <section className={styles.paginaSimples}>
      <h1 className={styles.titulo}>{titulo}</h1>
      <p className={styles.descricao}>Esta tela será implementada nas próximas fases.</p>
    </section>
  );
}
