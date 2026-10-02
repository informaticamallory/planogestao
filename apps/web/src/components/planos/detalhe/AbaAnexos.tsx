import type { PlanoDetalhe } from "@planogestao/shared-types";
import { useState } from "react";

import { useAnexosDoPlano, useBaixarAnexo, useEnviarAnexos } from "../../../hooks/usePlano";
import { formatarDataHora } from "../../../utils/datas";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { FileDropzone, formatarTamanho } from "../../ui/FileDropzone";
import styles from "./AbasPlano.module.css";

export function AbaAnexos({ plano }: { plano: PlanoDetalhe }) {
  const { data: anexos, isLoading, error } = useAnexosDoPlano(plano.id);
  const enviar = useEnviarAnexos(plano.id);
  const baixar = useBaixarAnexo(plano.id);
  const [selecionados, setSelecionados] = useState<File[]>([]);

  if (isLoading) return <p className={styles.estado}>Carregando anexos…</p>;
  if (error || !anexos) return <p className={styles.erro}>Não foi possível carregar os anexos.</p>;

  return (
    <div className={styles.aba}>
      {anexos.length === 0 ? (
        <p className={styles.estado}>Nenhum anexo enviado.</p>
      ) : (
        <ul className={styles.listaAnexos}>
          {anexos.map((a) => (
            <li key={a.id}>
              <Card>
                <div className={styles.anexo}>
                  <span className={styles.nomeAnexo}>{a.nome_arquivo}</span>
                  <span className={styles.metaAnexo}>
                    {formatarTamanho(a.tamanho_bytes)} · {a.enviado_por.nome} · {formatarDataHora(a.criado_em)}
                  </span>
                  <Button onClick={() => baixar.mutate(a.id)} disabled={baixar.isPending && baixar.variables === a.id}>
                    Baixar
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {baixar.isError && <p className={styles.erro}>Falha no download: {baixar.error.message}</p>}

      {plano.permissoes.enviar_anexos && (
        <section className={styles.secaoUpload}>
          <h2 className={styles.tituloSecao}>Enviar novos anexos</h2>
          <FileDropzone arquivos={selecionados} onAlterar={setSelecionados} />
          {enviar.isError && <p className={styles.erro}>Não foi possível enviar: {enviar.error.message}</p>}
          {selecionados.length > 0 && (
            <Button
              variante="primaria"
              className={styles.botaoInicio}
              disabled={enviar.isPending}
              onClick={() => enviar.mutate(selecionados, { onSuccess: () => setSelecionados([]) })}
            >
              {enviar.isPending ? "Enviando…" : `Enviar ${selecionados.length} arquivo(s)`}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
