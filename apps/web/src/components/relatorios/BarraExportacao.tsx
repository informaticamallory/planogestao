import type { ArquivoBaixado } from "@planogestao/api-client";
import type { FormatoExportacao } from "@planogestao/shared-types";
import { useMutation } from "@tanstack/react-query";

import { baixarArquivo } from "../../utils/download";
import { Button } from "../ui/Button";
import styles from "./Relatorios.module.css";

interface Props {
  /** Exporta os filtros APLICADOS (os da pré-visualização), nunca o rascunho do formulário. */
  exportar: (formato: FormatoExportacao) => Promise<ArquivoBaixado>;
  /** Falso quando o formulário foi alterado depois de gerar: evita arquivo diferente da tela. */
  sincronizado: boolean;
  temDados: boolean;
}

const FORMATOS: { formato: FormatoExportacao; rotulo: string }[] = [
  { formato: "xlsx", rotulo: "Excel" },
  { formato: "csv", rotulo: "CSV" },
  { formato: "pdf", rotulo: "PDF" },
];

export function BarraExportacao({ exportar, sincronizado, temDados }: Props) {
  const baixar = useMutation({
    mutationFn: async (formato: FormatoExportacao) => {
      const arquivo = await exportar(formato);
      baixarArquivo(arquivo.blob, arquivo.nomeArquivo);
    },
  });
  const habilitado = sincronizado && temDados && !baixar.isPending;

  return (
    <div className={styles.barraExportacao} data-nao-imprimir>
      <span className={styles.rotulo}>Exportar:</span>
      {FORMATOS.map((f) => (
        <Button key={f.formato} disabled={!habilitado} onClick={() => baixar.mutate(f.formato)}>
          {baixar.isPending && baixar.variables === f.formato ? "Gerando…" : f.rotulo}
        </Button>
      ))}
      <Button disabled={!sincronizado || !temDados} onClick={() => window.print()}>
        Imprimir
      </Button>
      {!sincronizado && <span className={styles.aviso}>Filtros alterados: clique em “Gerar relatório” para exportar.</span>}
      {baixar.isError && (
        <span className={styles.erro} role="alert">
          {baixar.error.message}
        </span>
      )}
    </div>
  );
}
