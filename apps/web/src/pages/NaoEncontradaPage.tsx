import { Link } from "react-router-dom";

import styles from "./PaginaSimples.module.css";

export function NaoEncontradaPage() {
  return (
    <section className={styles.paginaSimples}>
      <h1 className={styles.titulo}>Página não encontrada</h1>
      <Link to="/dashboard">Voltar ao Dashboard</Link>
    </section>
  );
}
