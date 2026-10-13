import { useAvisoStore } from "../../store/avisoStore";
import { Icon } from "../ui/Icon";
import styles from "./AvisoFlutuante.module.css";

/** Confirmação curta ("Plano excluído"): anunciada aos leitores de tela e sem roubar o foco. */
export function AvisoFlutuante() {
  const aviso = useAvisoStore((s) => s.aviso);
  const fechar = useAvisoStore((s) => s.fechar);

  return (
    // A região fica sempre no DOM: o leitor de tela anuncia quando o texto aparece.
    <div className={styles.regiao} role="status" aria-live="polite" data-nao-imprimir>
      {aviso && (
        <div key={aviso.id} className={styles.aviso}>
          <Icon name="check" size={18} />
          <span className={styles.texto}>{aviso.texto}</span>
          <button type="button" className={styles.fechar} onClick={fechar} aria-label="Fechar aviso">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
