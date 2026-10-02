import type { ArquivoBaixado } from "@planogestao/api-client";
import type { FormatoExportacao } from "@planogestao/shared-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { mesmosFiltros, objetoParaParams, paramsParaObjeto, type Esquema } from "../../utils/parametrosUrl";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Pagination } from "../ui/Pagination";
import { BarraExportacao } from "./BarraExportacao";
import { CabecalhoImpressao } from "./CabecalhoImpressao";
import styles from "./Relatorios.module.css";

export type Filtros = Record<string, string | number | boolean | undefined | null | (string | number)[]>;

interface MetaRelatorio<T> {
  filtros_aplicados: string[];
  gerado_em: string;
  total: number;
  items: T[];
}

interface AbaRelatorioProps<T> {
  id: string; // "planos" | "acoes" (chave de cache)
  titulo: string;
  esquema: Esquema;
  consultar: (filtros: Filtros, page: number, pageSize: number) => Promise<MetaRelatorio<T>>;
  exportar: (filtros: Filtros, formato: FormatoExportacao) => Promise<ArquivoBaixado>;
  renderFiltros: (rascunho: Filtros, alterar: (parcial: Filtros) => void) => ReactNode;
  renderTabela: (itens: T[]) => ReactNode;
}

const TAMANHOS = [50, 100, 200, 500];

/**
 * Fluxo comum dos relatórios: o formulário edita um RASCUNHO; "Gerar relatório" grava os
 * filtros APLICADOS na URL. Pré-visualização, exportação e impressão usam só os aplicados.
 */
export function AbaRelatorio<T>({ id, titulo, esquema, consultar, exportar, renderFiltros, renderTabela }: AbaRelatorioProps<T>) {
  const [params, setParams] = useSearchParams();
  const gerado = params.get("gerado") === "1";
  const aplicados = useMemo(() => paramsParaObjeto(params, esquema), [params, esquema]);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 50;

  const [rascunho, setRascunho] = useState<Filtros>(aplicados);
  // Voltar/avançar no navegador troca os aplicados: o formulário acompanha.
  useEffect(() => setRascunho(aplicados), [aplicados]);

  const relatorio = useQuery({
    queryKey: ["relatorios", id, aplicados, page, pageSize],
    queryFn: () => consultar(aplicados, page, pageSize),
    enabled: gerado,
    placeholderData: keepPreviousData,
  });

  const gravar = (filtros: Filtros, extra: Record<string, string>) =>
    setParams(() => {
      const p = objetoParaParams(filtros);
      const aba = params.get("aba");
      if (aba) p.set("aba", aba);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p;
    });

  const gerar = () => gravar(rascunho, { gerado: "1", page_size: String(pageSize) });
  const limpar = () => {
    setRascunho({});
    setParams(() => (params.get("aba") ? new URLSearchParams({ aba: params.get("aba")! }) : new URLSearchParams()));
  };
  const irPara = (mudancas: Record<string, string>) => gravar(aplicados, { gerado: "1", page: String(page), page_size: String(pageSize), ...mudancas });

  const sincronizado = gerado && mesmosFiltros(rascunho, aplicados);
  const dados = relatorio.data;
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / pageSize)) : 1;

  return (
    <div className={styles.aba}>
      <div data-nao-imprimir>
        <Card>
          <form
            className={styles.painelFiltros}
            onSubmit={(e) => {
              e.preventDefault();
              gerar();
            }}
          >
            {renderFiltros(rascunho, (parcial) => setRascunho((atual) => ({ ...atual, ...parcial })))}
            <div className={styles.botoesFiltro}>
              <Button onClick={limpar}>Limpar</Button>
              <Button type="submit" variante="primaria">
                Gerar relatório
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {!gerado ? (
        <p className={styles.estado} data-nao-imprimir>
          Defina os filtros e clique em “Gerar relatório” para ver a pré-visualização.
        </p>
      ) : relatorio.error ? (
        <p className={styles.erro}>Não foi possível gerar o relatório: {relatorio.error.message}</p>
      ) : !dados ? (
        <p className={styles.estado}>Gerando…</p>
      ) : (
        <>
          <CabecalhoImpressao titulo={titulo} filtros={dados.filtros_aplicados} geradoEm={dados.gerado_em} total={dados.total} pagina={page} paginas={paginas} />

          <div className={styles.resumo} data-nao-imprimir>
            <p className={styles.textoResumo}>
              <strong>{dados.total}</strong> registro(s) · Filtros: {dados.filtros_aplicados.length ? dados.filtros_aplicados.join(", ") : "nenhum"}
              {relatorio.isFetching && " · atualizando…"}
            </p>
            <BarraExportacao exportar={(f) => exportar(aplicados, f)} sincronizado={sincronizado} temDados={dados.total > 0} />
          </div>

          {dados.total === 0 ? <p className={styles.estado}>Nenhum registro com esses filtros.</p> : renderTabela(dados.items)}

          {dados.total > 0 && (
            <div data-nao-imprimir>
              <Pagination
                pagina={page}
                tamanho={pageSize}
                total={dados.total}
                tamanhos={TAMANHOS}
                onPagina={(p) => irPara({ page: String(p) })}
                onTamanho={(t) => irPara({ page: "1", page_size: String(t) })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
