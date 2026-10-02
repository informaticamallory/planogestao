import type { OrdenacaoPlano } from "@planogestao/shared-types";
import { useCallback, useMemo, useState } from "react";

import { AtalhosPlanos } from "../../components/planos/AtalhosPlanos";
import barra from "../../components/planos/BarraFerramentas.module.css";
import { BotaoExportar } from "../../components/planos/BotaoExportar";
import { BuscaPlanos } from "../../components/planos/BuscaPlanos";
import { COLUNAS_PADRAO, COLUNAS_PLANOS, IDS_COLUNAS } from "../../components/planos/colunasPlanos";
import { DrawerFiltrosPlanos, ROTULO_EXIBICAO } from "../../components/planos/DrawerFiltrosPlanos";
import { SeletorColunas } from "../../components/planos/SeletorColunas";
import { TabelaPlanos } from "../../components/planos/TabelaPlanos";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { TAMANHOS_PAGINA, contarFiltrosDrawer, useFiltrosPlanos } from "../../hooks/useFiltrosPlanos";
import { usePlanos } from "../../hooks/usePlanos";
import { usePreferencia } from "../../hooks/usePreferencia";
import { temPermissao, useAuthStore } from "../../store/authStore";
import styles from "./PlanosPage.module.css";

const ehListaDeColunas = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((id) => typeof id === "string" && IDS_COLUNAS.includes(id));

export function PlanosPage() {
  const { filtros, consulta, atualizar, limparFiltros } = useFiltrosPlanos();
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = usePreferencia("planos:colunas", COLUNAS_PADRAO, ehListaDeColunas);
  const podeCriar = useAuthStore((s) => temPermissao(s.usuario, "planos:criar"));
  const { data, isLoading, isFetching, error } = usePlanos(consulta);

  const colunas = useMemo(
    () => COLUNAS_PLANOS.filter((c) => c.fixa || colunasVisiveis.includes(c.id)),
    [colunasVisiveis],
  );

  const ordenarPor = (campo: OrdenacaoPlano) =>
    // Mesma coluna inverte a direção; coluna nova começa ascendente.
    atualizar({ ordenar: campo, direcao: filtros.ordenar === campo && filtros.direcao === "asc" ? "desc" : "asc" });

  const buscar = useCallback((q: string) => atualizar({ q }, { replace: true }), [atualizar]);
  const totalFiltros = contarFiltrosDrawer(filtros);
  const temAlgumFiltro = totalFiltros > 0 || filtros.q !== "" || filtros.meus;

  return (
    <div className={styles.planosPage}>
      <header className={styles.cabecalho}>
        <h1 className={styles.titulo}>Planos de Ação</h1>
        {podeCriar && (
          <ButtonLink to="/planos/novo" variante="primaria">
            Novo Plano
          </ButtonLink>
        )}
      </header>

      <AtalhosPlanos filtros={filtros} onSelecionar={(parcial) => atualizar(parcial)} />

      <div className={barra.barra}>
        <BuscaPlanos valor={filtros.q} onBuscar={buscar} />
        <Button onClick={() => setDrawerAberto(true)}>
          Filtros
          {totalFiltros > 0 && <span className={barra.contador}>{totalFiltros}</span>}
        </Button>
        {temAlgumFiltro && (
          <Button onClick={limparFiltros}>Limpar filtros</Button>
        )}
        <div className={styles.exibicao} role="group" aria-label="Exibição">
          <span className={styles.rotuloExibicao}>Exibição:</span>
          {(["excluir", "somente", "incluir"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={filtros.arquivados === a}
              className={filtros.arquivados === a ? `${styles.opcaoExibicao} ${styles.opcaoAtiva}` : styles.opcaoExibicao}
              onClick={() => atualizar({ arquivados: a })}
            >
              {ROTULO_EXIBICAO[a]}
            </button>
          ))}
        </div>
        <span className={barra.espaco} />
        {isFetching && !isLoading && <span className={styles.atualizando}>Atualizando…</span>}
        <SeletorColunas visiveis={colunasVisiveis} onAlterar={setColunasVisiveis} />
        <BotaoExportar consulta={consulta} />
      </div>

      {filtros.arquivados !== "excluir" && (
        <p className={styles.avisoEscopo} role="status">
          {filtros.arquivados === "somente"
            ? "Exibindo planos arquivados (somente leitura). Eles ficam fora do Dashboard e dos Indicadores de planos ativos."
            : "Exibindo ativos e arquivados. Dashboard e Indicadores continuam considerando só os planos ativos."}
        </p>
      )}

      {error ? (
        <p className={styles.erro} role="alert">
          Não foi possível carregar os planos: {error.message}
        </p>
      ) : isLoading ? (
        <p className={styles.estado}>Carregando…</p>
      ) : data && data.items.length === 0 ? (
        <div className={styles.estado}>
          <p>Nenhum plano encontrado com os filtros aplicados.</p>
          {temAlgumFiltro && (
            <Button onClick={limparFiltros}>Limpar filtros</Button>
          )}
        </div>
      ) : (
        data && (
          <TabelaPlanos
            planos={data.items}
            colunas={colunas}
            ordenar={filtros.ordenar}
            direcao={filtros.direcao}
            onOrdenar={ordenarPor}
          />
        )
      )}

      {data && data.total > 0 && (
        <Pagination
          pagina={filtros.page}
          tamanho={filtros.page_size}
          total={data.total}
          tamanhos={TAMANHOS_PAGINA}
          onPagina={(page) => atualizar({ page })}
          onTamanho={(page_size) => atualizar({ page_size })}
        />
      )}

      <DrawerFiltrosPlanos
        aberto={drawerAberto}
        filtros={filtros}
        onFechar={() => setDrawerAberto(false)}
        onAplicar={(rascunho) => {
          atualizar(rascunho);
          setDrawerAberto(false);
        }}
      />
    </div>
  );
}
