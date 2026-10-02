import { Field, fieldAria } from "../../ui/Field";
import { Textarea } from "../../ui/Input";
import { FileDropzone } from "../../ui/FileDropzone";
import type { Erros, PlanoForm } from "./formularioPlano";
import styles from "./Etapas.module.css";

interface Props {
  form: PlanoForm;
  alterar: (parcial: Partial<PlanoForm>) => void;
  erros: Erros;
  obrigatorio: boolean;
  /** Na edição, anexos são gerenciados na aba Anexos do plano. */
  mostrarAnexos?: boolean;
}

type CampoTexto = "descricao" | "descricao_problema" | "objetivo" | "causa" | "evidencias" | "observacoes";

const CAMPOS: { campo: CampoTexto; rotulo: string; obrigatorio?: boolean; ajuda?: string }[] = [
  { campo: "descricao", rotulo: "Descrição", ajuda: "Contexto geral do plano." },
  { campo: "descricao_problema", rotulo: "Problema identificado", obrigatorio: true },
  { campo: "objetivo", rotulo: "Objetivo", obrigatorio: true, ajuda: "O que se espera alcançar (de preferência mensurável)." },
  { campo: "causa", rotulo: "Causa", ajuda: "Causa raiz identificada (5 porquês, Ishikawa…)." },
  { campo: "evidencias", rotulo: "Evidências" },
  { campo: "observacoes", rotulo: "Observações" },
];

export function EtapaProblema({ form, alterar, erros, obrigatorio, mostrarAnexos = true }: Props) {
  return (
    <div className={styles.grade}>
      {CAMPOS.map((c) => (
        <Field
          key={c.campo}
          id={c.campo}
          rotulo={c.rotulo}
          obrigatorio={obrigatorio && c.obrigatorio}
          erro={erros[c.campo]}
          ajuda={c.ajuda}
          className={styles.largo}
        >
          <Textarea
            {...fieldAria(c.campo, erros[c.campo])}
            autoAjuste
            value={form[c.campo]}
            maxLength={10_000}
            onChange={(e) => alterar({ [c.campo]: e.target.value })}
          />
        </Field>
      ))}

      {mostrarAnexos && (
        <div className={styles.largo}>
          <span className={styles.rotuloSecao}>Anexos</span>
          <FileDropzone arquivos={form.anexos} onAlterar={(anexos) => alterar({ anexos })} />
        </div>
      )}
    </div>
  );
}
