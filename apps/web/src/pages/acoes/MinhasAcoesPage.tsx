import type { SituacaoMinhaAcao } from "@planogestao/api-client";
import { Link, useSearchParams } from "react-router-dom";

import { DetalheAcao } from "../../components/acoes/DetalheAcao";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Drawer } from "../../components/ui/Drawer";
import { Pagination } from "../../components/ui/Pagination";
import { ActionStatusBadge, DeadlineStatusLabel } from "../../components/ui/StatusBadges";
import { Table } from "../../components/ui/Table";
import { useListaMinhasAcoes, useResumoMinhasAcoes } from "../../hooks/useMinhasAcoes";
import { formatarData } from "../../utils/datas";
import styles from "./MinhasAcoesPage.module.css";

interface Cartao {
  situacao: SituacaoMinhaAcao;
  chave: "atrasadas" | "vencendo" | "em_andamento" | "concluidas";
  nome: string;
  ajuda: string;
}

// Situação do prazo (tag), não status: uma ação "em andamento" pode estar "em atraso".
const CARTOES: Cartao[] = [
  { situacao: "atrasada", chave: "atrasadas", nome: "Em atraso", ajuda: "Em aberto, prazo de conclusão já passou" },
  { situacao: "vencendo", chave: "vencendo", nome: "A vencer", ajuda: "Vence hoje ou nos próximos 3 dias" },
  { situacao: "em_andamento", chave: "em_andamento", nome: "No prazo", ajuda: "Em aberto, vence depois de 3 dias" },
  { situacao: "concluida", chave: "concluidas", nome: "Concluídas", ajuda: "Todas as concluídas" },
];
const TAG_DA_SITUACAO = { atrasada: "em_atraso", vencendo: "a_vencer", em_andamento: "no_prazo", concluida: null } as const;
const SITUACOES = CARTOES.map((c) => c.situacao);
const TAMANHOS = [10, 20, 50];

export function MinhasAcoesPage() {
  // Filtro, página e ação aberta ficam na URL (recarregar/compartilhar mantém a visão).
  const [params, setParams] = useSearchParams();
  const brutoSituacao = params.get("situacao") as SituacaoMinhaAcao | null;
  const situacao = brutoSituacao && SITUACOES.includes(brutoSituacao) ? brutoSituacao : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20;
  const acaoAberta = Number(params.get("acao")) || null;

  const resumo = useResumoMinhasAcoes();
  const lista = useListaMinhasAcoes({ situacao, page, page_size: pageSize });

  const atualizar = (mudancas: Record<string, string | null>) =>
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      return p;
    });

  const filtrar = (s: SituacaoMinhaAcao | undefined) =>
    atualizar({ situacao: s && s !== situacao ? s : null, page: null });

  const totalGeral = resumo.data ? CARTOES.reduce((soma, c) => soma + resumo.data[c.chave], 0) : undefined;

  return (
    <div className={styles.pagina}>
      <h1 className={styles.titulo}>Minhas Ações</h1>

      <div className={styles.cartoes} role="group" aria-label="Filtrar por situação">
        {CARTOES.map((c) => {
          const ativo = situacao === c.situacao;
          return (
            <button
              key={c.situacao}
              type="button"
              aria-pressed={ativo}
              className={ativo ? `${styles.cartao} ${styles.cartaoAtivo}` : styles.cartao}
              onClick={() => filtrar(c.situacao)}
            >
              <span className={styles.rotuloCartao}>
                <DeadlineStatusLabel situacao={c.situacao} texto={c.nome} />
              </span>
              <span className={styles.valorCartao}>{resumo.data ? resumo.data[c.chave] : "—"}</span>
              <span className={styles.ajudaCartao}>{c.ajuda}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.barra}>
        <span className={styles.legenda}>
          {situacao
            ? `Filtrando: ${CARTOES.find((c) => c.situacao === situacao)!.nome}`
            : `Todas as suas ações${totalGeral !== undefined ? ` (${totalGeral})` : ""}`}
        </span>
        {situacao && (
          <Button variante="link" onClick={() => filtrar(undefined)}>
            Ver todas
          </Button>
        )}
        {lista.isFetching && !lista.isLoading && <span className={styles.legenda}>Atualizando…</span>}
      </div>

      {lista.error ? (
        <p className={styles.erro}>Não foi possível carregar suas ações: {lista.error.message}</p>
      ) : lista.isLoading ? (
        <p className={styles.estado}>Carregando…</p>
      ) : lista.data && lista.data.items.length === 0 ? (
        <p className={styles.estado}>{situacao ? "Nenhuma ação nesta situação." : "Você não tem ações atribuídas."}</p>
      ) : (
        lista.data && (
          <Card semPadding>
            <Table className={styles.tabela}>
              <thead>
                <tr>
                  <th scope="col">Ação</th>
                  <th scope="col">Plano</th>
                  <th scope="col">Prazo</th>
                  <th scope="col">Progresso</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {lista.data.items.map((a) => (
                  <tr
                    key={a.id}
                    className={a.id === acaoAberta ? `${styles.linha} ${styles.linhaAberta}` : styles.linha}
                    onClick={() => atualizar({ acao: String(a.id) })}
                  >
                    <td className={styles.colunaAcao}>
                      {/* Botão real: abre o detalhe pelo teclado também. */}
                      <button type="button" className={styles.botaoAcao} onClick={(e) => (e.stopPropagation(), atualizar({ acao: String(a.id) }))}>
                        {a.acao_origem ? `Sub-item ${a.numero}` : `Ação ${a.numero}`} — {a.descricao}
                      </button>
                      {a.acao_origem && <span className={styles.legenda}>Origem: {a.acao_origem}</span>}
                      {a.status === "aguardando_aceite" && <Badge corToken="--cor-status-aguardando_aceite">Aguardando seu aceite</Badge>}
                      {a.solicitacao_pendente && <Badge corToken="--cor-status-aguardando_aceite">Solicitação de prazo pendente</Badge>}
                    </td>
                    <td>
                      {/* Subação não dá acesso ao plano: o código aparece sem link. */}
                      {a.acao_origem ? (
                        <span title={a.plano.nome}>{a.plano.codigo}</span>
                      ) : (
                        <Link to={`/planos/${a.plano.id}`} onClick={(e) => e.stopPropagation()} title={a.plano.nome}>
                          {a.plano.codigo}
                        </Link>
                      )}
                    </td>
                    <td className={styles.numero}>{formatarData(a.prazo)}</td>
                    <td className={styles.colunaProgresso}>
                      <ProgressBar valor={a.progresso} rotulo={`Progresso de ${a.descricao}`} />
                    </td>
                    <td>
                      {/* Status + tag de prazo (a situação da API é a tag das abertas). */}
                      <ActionStatusBadge status={a.status} prazoTag={TAG_DA_SITUACAO[a.situacao]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )
      )}

      {lista.data && lista.data.total > 0 && (
        <Pagination
          pagina={page}
          tamanho={pageSize}
          total={lista.data.total}
          tamanhos={TAMANHOS}
          onPagina={(p) => atualizar({ page: String(p) })}
          onTamanho={(t) => atualizar({ page_size: String(t), page: null })}
        />
      )}

      {acaoAberta && (
        <Drawer
          aberto
          largura={880}
          titulo="Detalhe da ação"
          onFechar={() => atualizar({ acao: null })}
          acoesCabecalho={<Link to={`/acoes/${acaoAberta}`}>Abrir em página</Link>}
        >
          <DetalheAcao acaoId={acaoAberta} compacto />
        </Drawer>
      )}
    </div>
  );
}
