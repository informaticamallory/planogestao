import type { ConsultaPlanos } from "@planogestao/api-client";
import type { FormatoExportacao } from "@planogestao/shared-types";

import { useExportarPlanos } from "../../hooks/usePlanos";
import { classesDoBotao } from "../ui/Button";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";
import styles from "./BarraFerramentas.module.css";

const FORMATOS: { formato: FormatoExportacao; rotulo: string }[] = [
  { formato: "xlsx", rotulo: "Excel (.xlsx)" },
  { formato: "csv", rotulo: "CSV (.csv)" },
  { formato: "pdf", rotulo: "PDF (.pdf)" },
];

/** Exporta exatamente a consulta atual (filtros + ordenação); o backend ignora a paginação. */
export function BotaoExportar({ consulta }: { consulta: ConsultaPlanos }) {
  const exportar = useExportarPlanos();

  return (
    <>
      <DropdownMenu rotulo={exportar.isPending ? "Exportando…" : "Exportar"} classeBotao={classesDoBotao({})}>
        {(fechar) =>
          FORMATOS.map((f) => (
            <DropdownItem
              key={f.formato}
              disabled={exportar.isPending}
              onClick={() => {
                fechar();
                exportar.mutate({ consulta, formato: f.formato });
              }}
            >
              {f.rotulo}
            </DropdownItem>
          ))
        }
      </DropdownMenu>
      {exportar.isError && (
        <p className={styles.erro} role="alert">
          {exportar.error.message}
        </p>
      )}
    </>
  );
}
