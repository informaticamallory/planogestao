import { Link } from "react-router-dom";

import styles from "./PaginaSimples.module.css";

export function AcessoNegadoPage() {
  return (
    <section className={styles.paginaSimples}>
      <h1 className={styles.titulo}>Acesso negado</h1>
      <p className={styles.descricao}>Seu perfil não tem permissão para acessar esta página.</p>
      <Link to="/dashboard">Voltar ao Dashboard</Link>
    </section>
  );
}
