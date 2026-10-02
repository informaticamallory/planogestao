import { useSearchParams } from "react-router-dom";

import { RelatorioAcoes } from "../../components/relatorios/RelatorioAcoes";
import { RelatorioPlanos } from "../../components/relatorios/RelatorioPlanos";
import styles from "../../components/relatorios/Relatorios.module.css";
import { Tabs } from "../../components/ui/Tabs";

type IdAba = "planos" | "acoes";

export function RelatoriosPage() {
  const [params, setParams] = useSearchParams();
  const aba: IdAba = params.get("aba") === "acoes" ? "acoes" : "planos";

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo} data-nao-imprimir>
        Relatórios
      </h1>
      <div className={styles.abasTela}>
        <Tabs<IdAba>
          rotulo="Tipo de relatório"
          abas={[
            { id: "planos", rotulo: "Relatório de Planos" },
            { id: "acoes", rotulo: "Relatório de Ações" },
          ]}
          ativa={aba}
          // Cada aba tem seus próprios filtros: trocar de aba começa um relatório novo.
          onSelecionar={(id) => setParams(id === "planos" ? {} : { aba: id })}
        >
          {aba === "planos" ? <RelatorioPlanos /> : <RelatorioAcoes />}
        </Tabs>
      </div>
    </div>
  );
}
