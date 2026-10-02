import { useHistoricoAcao } from "../../hooks/useAcao";
import { formatarDataHora } from "../../utils/datas";
import { descreverEventoAcao } from "../../utils/historico";
import styles from "./Acao.module.css";

const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** Ex.: "23/09 — João Silva alterou o progresso de 30% para 70%". */
export function TimelineAcao({ acaoId }: { acaoId: number }) {
  const { data, isLoading, error } = useHistoricoAcao(acaoId);

  return (
    <section className={styles.bloco} aria-labelledby="titulo-historico">
      <h2 id="titulo-historico" className={styles.tituloBloco}>
        Histórico
      </h2>
      {isLoading && <p className={styles.textoApoio}>Carregando…</p>}
      {error && <p className={styles.erro}>Não foi possível carregar o histórico.</p>}
      {data && data.length === 0 && <p className={styles.textoApoio}>Nenhum evento registrado.</p>}
      {data && data.length > 0 && (
        <ol className={styles.timeline}>
          {data.map((h) => (
            <li key={h.id} className={`${styles.evento} ${styles[`evento_${h.evento}`] ?? ""}`}>
              <time className={styles.dataEvento} dateTime={h.criado_em} title={formatarDataHora(h.criado_em)}>
                {fmtDiaMes.format(new Date(h.criado_em))}
              </time>
              <p className={styles.fraseEvento}>
                <strong>{h.usuario.nome}</strong> {descreverEventoAcao(h)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
