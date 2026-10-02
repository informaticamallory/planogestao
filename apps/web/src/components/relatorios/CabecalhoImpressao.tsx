import { formatarDataHora } from "../../utils/datas";
import styles from "./Relatorios.module.css";

/** Só aparece no papel: título, filtros aplicados e qual página da pré-visualização foi impressa. */
export function CabecalhoImpressao({
  titulo,
  filtros,
  geradoEm,
  total,
  pagina,
  paginas,
}: {
  titulo: string;
  filtros: string[];
  geradoEm: string;
  total: number;
  pagina: number;
  paginas: number;
}) {
  return (
    <div data-somente-impressao className={styles.cabecalhoImpressao}>
      <h1>{titulo}</h1>
      <p>Filtros: {filtros.length ? filtros.join(", ") : "nenhum"}</p>
      <p>
        Gerado em {formatarDataHora(geradoEm)} · {total} registro(s)
        {paginas > 1 && ` · página ${pagina} de ${paginas} da pré-visualização`}
      </p>
    </div>
  );
}
