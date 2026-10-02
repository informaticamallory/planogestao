import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useSalvarAparencia } from "../../hooks/useMeuPerfil";
import { useAparencia, type Densidade } from "../../store/aparenciaStore";
import styles from "./ControlesAparencia.module.css";

const DENSIDADES: { id: Densidade; rotulo: string; titulo: string }[] = [
  { id: "compact", rotulo: "Comp", titulo: "Compacta" },
  { id: "comfortable", rotulo: "Conf", titulo: "Confortável" },
  { id: "spacious", rotulo: "Espa", titulo: "Espaçosa" },
];

/**
 * Atalho do tema (salvo na conta, o mesmo de Meu Perfil › Aparência) e densidade (deste navegador).
 * O atalho alterna entre claro e escuro a partir do tema em uso; "automático" só se escolhe em Meu Perfil.
 */
export function ControlesAparencia({ comDensidade = true }: { comDensidade?: boolean }) {
  const { tema, densidade, setDensidade } = useAparencia();
  const salvarAparencia = useSalvarAparencia();
  const escuro = tema === "dark";
  const alternarTema = () => salvarAparencia.mutate({ tema: escuro ? "claro" : "escuro" });

  return (
    <div className={styles.controles}>
      {comDensidade && (
        <div className={styles.segmentado} role="group" aria-label="Densidade do layout">
          {DENSIDADES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === densidade ? `${styles.opcao} ${styles.opcaoAtiva}` : styles.opcao}
              aria-pressed={d.id === densidade}
              title={`Densidade ${d.titulo.toLowerCase()}`}
              onClick={() => setDensidade(d.id)}
            >
              <span aria-hidden="true">{d.rotulo}</span>
              <span className="sr-only">{d.titulo}</span>
            </button>
          ))}
        </div>
      )}
      <Button
        variante="icone"
        onClick={alternarTema}
        aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
        title={escuro ? "Tema claro" : "Tema escuro"}
      >
        <Icon name={escuro ? "sun" : "moon"} size={17} />
      </Button>
    </div>
  );
}
