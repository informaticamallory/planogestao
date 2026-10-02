import { usePreferencia } from "../../../hooks/usePreferencia";
import type { ModoWizard } from "../../ui/Wizard";
import styles from "./SeletorModo.module.css";

const MODOS: { id: ModoWizard; rotulo: string; titulo: string }[] = [
  { id: "geral", rotulo: "Geral", titulo: "Todas as seções na mesma página" },
  { id: "abas", rotulo: "Abas", titulo: "Uma seção por vez" },
];

const ehModo = (v: unknown): v is ModoWizard => v === "geral" || v === "abas";

/** Modo de visualização do formulário do plano (criação e edição), lembrado por usuário. */
export const useModoFormularioPlano = () => usePreferencia<ModoWizard>("formularioPlano.modo", "abas", ehModo);

export function SeletorModo({ modo, onMudar }: { modo: ModoWizard; onMudar: (modo: ModoWizard) => void }) {
  return (
    <div className={styles.segmentado} role="group" aria-label="Visualização do formulário">
      {MODOS.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.titulo}
          aria-pressed={modo === m.id}
          className={modo === m.id ? `${styles.opcao} ${styles.opcaoAtiva}` : styles.opcao}
          onClick={() => onMudar(m.id)}
        >
          {m.rotulo}
        </button>
      ))}
    </div>
  );
}
