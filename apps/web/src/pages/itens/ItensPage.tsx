import { Link } from "react-router-dom";

import { FiltrosItensBarra } from "../../components/itens/FiltrosItensBarra";
import { Card } from "../../components/ui/Card";
import { Pagination } from "../../components/ui/Pagination";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { ActionStatusBadge } from "../../components/ui/StatusBadges";
import { Table } from "../../components/ui/Table";
import { useFiltrosItens, useListaItens } from "../../hooks/useItens";
import { formatarData } from "../../utils/datas";
import styles from "./Itens.module.css";

/**
 * Listagem de itens (ações principais e sub-itens de todos os níveis), com filtros do próprio item.
 * É o destino dos cards do Dashboard; o resumo fica no Dashboard e o detalhamento em Indicadores.
 */
/** Período dos filtros, para o Dashboard (que filtra pela data de criação). */
function periodoNaUrl(f: { periodo?: string | null; data_inicio?: string | null; data_fim?: string | null; campo_data?: string | null }) {
  if (!f.periodo || f.campo_data === "prazo") return "";
  const p = new URLSearchParams({ periodo: f.periodo });
  if (f.data_inicio) p.set("data_inicio", f.data_inicio);
  if (f.data_fim) p.set("data_fim", f.data_fim);
  return `?${p}`;
}

export function ItensPage() {
  const { filtros, pagina, tamanho, atualizar, limpar } = useFiltrosItens();
  const { data, isLoading, error, isFetching } = useListaItens({ ...filtros, page: pagina, page_size: tamanho });

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Ações e sub-itens</h1>
          <p className={styles.subtitulo}>
            {data ? `${data.total.toLocaleString("pt-BR")} item(ns)` : " "} · <Link to={`/dashboard${periodoNaUrl(filtros)}`}>Ver resumo no Dashboard</Link>
          </p>
        </div>
        {isFetching && !isLoading && <span className={styles.escopo}>Atualizando…</span>}
      </header>

      <FiltrosItensBarra filtros={filtros} onAlterar={atualizar} onLimpar={limpar} comNivel />

      {error ? (
        <p className={styles.erro} role="alert">
          Não foi possível carregar os itens: {(error as Error).message}
        </p>
      ) : isLoading || !data ? (
        <p className={styles.estado}>Carregando…</p>
      ) : data.items.length === 0 ? (
        <p className={styles.estado}>Nenhum item com os filtros aplicados.</p>
      ) : (
        <Card semPadding>
          <Table>
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Item</th>
                <th scope="col">Responsável</th>
                <th scope="col">Área / Setor</th>
                <th scope="col">Início estimado</th>
                <th scope="col">Prazo de conclusão</th>
                <th scope="col">Status</th>
                <th scope="col">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td className={styles.numero}>{i.numero}</td>
                  <td>
                    <Link to={`/acoes/${i.id}`}>
                      {i.eh_subacao ? "Sub-item" : "Ação"} {i.numero} — {i.descricao}
                    </Link>
                    {/* Caminho de origem até o PA. */}
                    <span className={styles.caminho}>{i.caminho}</span>
                  </td>
                  <td>{i.responsavel.nome}</td>
                  <td>
                    {i.area.nome}
                    {i.setor && ` / ${i.setor.nome}`}
                  </td>
                  <td>{i.prazo_inicio ? formatarData(i.prazo_inicio) : "—"}</td>
                  <td>{formatarData(i.prazo)}</td>
                  <td>
                    <ActionStatusBadge status={i.status} prazoTag={i.prazo_tag} />
                  </td>
                  <td>
                    <ProgressBar valor={i.progresso} rotulo={`Progresso de ${i.numero}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {data && data.total > 0 && (
        <Pagination
          pagina={pagina}
          tamanho={tamanho}
          total={data.total}
          tamanhos={[10, 20, 50, 100]}
          onPagina={(page) => atualizar({ page })}
          onTamanho={(page_size) => atualizar({ page_size })}
        />
      )}
    </div>
  );
}
