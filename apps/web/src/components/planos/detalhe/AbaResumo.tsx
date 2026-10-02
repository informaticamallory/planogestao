import type { PlanoDetalhe } from "@planogestao/shared-types";

import { formatarData, formatarDataHora } from "../../../utils/datas";
import { Card } from "../../ui/Card";
import styles from "./AbasPlano.module.css";

const SECOES: { campo: keyof Pick<PlanoDetalhe, "descricao" | "descricao_problema" | "objetivo" | "causa" | "evidencias" | "observacoes">; titulo: string }[] = [
  { campo: "descricao", titulo: "Descrição" },
  { campo: "descricao_problema", titulo: "Problema identificado" },
  { campo: "objetivo", titulo: "Objetivo" },
  { campo: "causa", titulo: "Causa" },
  { campo: "evidencias", titulo: "Evidências" },
  { campo: "observacoes", titulo: "Observações" },
];

export function AbaResumo({ plano }: { plano: PlanoDetalhe }) {
  return (
    <div className={styles.resumo}>
      <div className={styles.textos}>
        {SECOES.map((s) => (
          <Card key={s.campo} titulo={s.titulo}>
            {plano[s.campo] ? (
              <p className={styles.textoLongo}>{plano[s.campo]}</p>
            ) : (
              <p className={styles.vazio}>Não informado.</p>
            )}
          </Card>
        ))}
      </div>

      <aside aria-label="Identificação do plano">
        <Card titulo="Identificação">
          <dl className={styles.listaFicha}>
            <dt>Tipo</dt>
            <dd>{plano.tipo.nome}</dd>
            <dt>Origem</dt>
            <dd>{plano.origem.nome}</dd>
            <dt>Início estimado</dt>
            <dd>{formatarData(plano.data_inicio_estimado)}</dd>
            <dt>Fim estimado</dt>
            <dd>{formatarData(plano.data_fim_estimado)}</dd>
            <dt>Criado por</dt>
            <dd>
              {plano.criado_por.nome} em {formatarDataHora(plano.criado_em)}
            </dd>
            {plano.concluido_em && (
              <>
                <dt>Concluído em</dt>
                <dd>{formatarDataHora(plano.concluido_em)}</dd>
              </>
            )}
            <dt>Última atualização</dt>
            <dd>{formatarDataHora(plano.atualizado_em)}</dd>
          </dl>
        </Card>
      </aside>
    </div>
  );
}
