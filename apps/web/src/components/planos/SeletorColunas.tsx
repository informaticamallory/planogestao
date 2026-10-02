import { COLUNAS_PADRAO, COLUNAS_PLANOS } from "./colunasPlanos";
import { classesDoBotao } from "../ui/Button";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";
import { Checkbox } from "../ui/Input";
import styles from "./BarraFerramentas.module.css";

export function SeletorColunas({ visiveis, onAlterar }: { visiveis: string[]; onAlterar: (ids: string[]) => void }) {
  const alternar = (id: string) =>
    // Mantém a ordem canônica das colunas, independentemente da ordem dos cliques.
    onAlterar(COLUNAS_PLANOS.map((c) => c.id).filter((c) => (c === id ? !visiveis.includes(id) : visiveis.includes(c))));

  return (
    <DropdownMenu rotulo="Colunas" classeBotao={classesDoBotao({})}>
      {() => (
        <>
          {COLUNAS_PLANOS.map((c) => (
            <Checkbox
              key={c.id}
              className={styles.opcaoColuna}
              rotulo={c.titulo}
              checked={c.fixa || visiveis.includes(c.id)}
              disabled={c.fixa}
              onChange={() => alternar(c.id)}
            />
          ))}
          <hr className={styles.separador} />
          <DropdownItem onClick={() => onAlterar(COLUNAS_PADRAO)}>Restaurar padrão</DropdownItem>
        </>
      )}
    </DropdownMenu>
  );
}
