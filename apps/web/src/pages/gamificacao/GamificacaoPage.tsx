import type { FiltrosGamificacao } from "@planogestao/api-client";
import type { ColaboradorRanking, TipoPeriodo } from "@planogestao/shared-types";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/gamificacao/Gamificacao.module.css";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { KpiCard, type KpiTom } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import {
  useAtualizarGamificacao,
  useOpcoesGamificacao,
  usePodio,
  useRanking,
  useRegrasPontuacao,
  useResumoGamificacao,
} from "../../hooks/useGamificacao";
import { formatarData } from "../../utils/datas";
import { ROTULO_PERIODO } from "../../utils/rotulos";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TAMANHOS = [10, 20, 50];
const idPositivo = (v: string | null) => (v && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : undefined);
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}%`);
// Medalhas do top 3: ícone do kit na cor da medalha (a posição continua escrita ao lado).
const MEDALHAS: Record<number, string> = { 1: "--cor-medalha-ouro", 2: "--cor-medalha-prata", 3: "--cor-medalha-bronze" };

export function GamificacaoPage() {
  const [params, setParams] = useSearchParams();
  const periodoBruto = params.get("periodo");
  const periodo: TipoPeriodo = periodoBruto && periodoBruto in ROTULO_PERIODO ? (periodoBruto as TipoPeriodo) : "mes_atual";
  const dataInicio = params.get("data_inicio") ?? "";
  const dataFim = params.get("data_fim") ?? "";
  const personalizadoValido = ISO.test(dataInicio) && ISO.test(dataFim) && dataInicio <= dataFim;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 10;

  // Um único objeto de filtros para cards, pódio e tabela.
  const filtros: FiltrosGamificacao = useMemo(() => {
    const base: FiltrosGamificacao =
      periodo === "personalizado"
        ? personalizadoValido
          ? { periodo, data_inicio: dataInicio, data_fim: dataFim }
          : { periodo: "mes_atual" }
        : { periodo };
    return {
      ...base,
      area_id: idPositivo(params.get("area_id")),
      setor_id: idPositivo(params.get("setor_id")),
      equipe_id: idPositivo(params.get("equipe_id")),
    };
  }, [params, periodo, dataInicio, dataFim, personalizadoValido]);

  const atualizar = (mudancas: Record<string, string | null>, manterPagina = false) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual);
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (!valor) p.delete(chave);
          else p.set(chave, valor);
        }
        if (!manterPagina) p.delete("page");
        return p;
      },
      { replace: true },
    );

  const opcoes = useOpcoesGamificacao();
  const daArea = <T extends { area_id: number }>(lista: T[] | undefined) => (lista ?? []).filter((e) => !filtros.area_id || e.area_id === filtros.area_id);
  const setores = daArea(opcoes.data?.setores);
  // Equipes cadastradas (módulo Equipes): o ranking considera só os membros.
  const equipes = daArea(opcoes.data?.equipes);
  const regras = useRegrasPontuacao();
  const resumo = useResumoGamificacao(filtros);
  const podio = usePodio(filtros);
  const ranking = useRanking(filtros, page, pageSize);
  const recarregar = useAtualizarGamificacao();
  const buscando = resumo.isFetching || podio.isFetching || ranking.isFetching;

  const r = resumo.data;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Gamificação &amp; Eficiência</h1>
          <p className={styles.subtitulo}>
            {r
              ? `Entregas de ${formatarData(r.periodo_inicio)} a ${formatarData(r.periodo_fim)} · tendência comparada a ${formatarData(r.periodo_anterior_inicio)}–${formatarData(r.periodo_anterior_fim)}`
              : "Pontos creditados automaticamente na conclusão de ações e planos."}
          </p>
        </div>

        <div className={styles.filtros}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Período</span>
            <Select compacto value={periodo} onChange={(e) => atualizar({ periodo: e.target.value === "mes_atual" ? null : e.target.value })}>
              {(Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERIODO[p]}
                </option>
              ))}
            </Select>
          </label>
          {periodo === "personalizado" && (
            <>
              <label className={styles.campo}>
                <span className={styles.rotulo}>De</span>
                <Input compacto type="date" value={dataInicio} max={dataFim || undefined} onChange={(e) => atualizar({ data_inicio: e.target.value })} />
              </label>
              <label className={styles.campo}>
                <span className={styles.rotulo}>Até</span>
                <Input compacto type="date" value={dataFim} min={dataInicio || undefined} onChange={(e) => atualizar({ data_fim: e.target.value })} />
              </label>
            </>
          )}
          <label className={styles.campo}>
            <span className={styles.rotulo}>Área</span>
            <Select
              compacto
              value={filtros.area_id ?? ""}
              onChange={(e) => {
                // Setor/equipe de outra área deixaria o ranking vazio sem motivo aparente.
                const area = Number(e.target.value) || undefined;
                const setorValido = opcoes.data?.setores.some((s) => s.id === filtros.setor_id && s.area_id === area);
                const equipeValida = opcoes.data?.equipes.some((q) => q.id === filtros.equipe_id && q.area_id === area);
                atualizar({
                  area_id: e.target.value || null,
                  setor_id: area && !setorValido ? null : params.get("setor_id"),
                  equipe_id: area && !equipeValida ? null : params.get("equipe_id"),
                });
              }}
            >
              <option value="">Todas</option>
              {opcoes.data?.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Setor</span>
            <Select compacto value={filtros.setor_id ?? ""} onChange={(e) => atualizar({ setor_id: e.target.value || null })}>
              <option value="">Todos</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Equipe</span>
            <Select compacto value={filtros.equipe_id ?? ""} onChange={(e) => atualizar({ equipe_id: e.target.value || null })}>
              <option value="">{equipes.length ? "Todas" : "Nenhuma cadastrada"}</option>
              {equipes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome}
                </option>
              ))}
            </Select>
          </label>
          <Button variante="primaria" onClick={() => void recarregar()} disabled={buscando}>
            {buscando ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </header>

      {periodo === "personalizado" && !personalizadoValido && (
        <p className={styles.aviso}>Informe as duas datas do período personalizado. Enquanto isso, é exibido o mês atual.</p>
      )}

      {resumo.error ? (
        <p className={styles.erro}>Não foi possível carregar o resumo: {resumo.error.message}</p>
      ) : (
        <section className={styles.kpis} aria-label="Resumo do período" aria-busy={resumo.isLoading}>
          <Kpi tom="primaria" rotulo="Colaboradores" valor={r ? num(r.colaboradores) : "…"} detalhe="Pontuaram no período" />
          <Kpi tom="info" rotulo="Planos ativos" valor={r ? num(r.planos_ativos) : "…"} detalhe="Em andamento agora" />
          <Kpi tom="sucesso" rotulo="Ações concluídas" valor={r ? num(r.acoes_concluidas) : "…"} detalhe="Entregues no período" />
          <Kpi tom="sucesso" rotulo="No prazo" valor={r ? pct(r.percentual_no_prazo) : "…"} detalhe={r ? `${num(r.acoes_no_prazo)} de ${num(r.acoes_concluidas)} entregas` : undefined} />
          <Kpi tom="aviso" rotulo="Pontos distribuídos" valor={r ? num(r.pontos_distribuidos) : "…"} detalhe={r ? `${num(r.planos_concluidos)} plano(s) concluído(s)` : undefined} />
        </section>
      )}

      <section aria-labelledby="titulo-regras">
        <h2 id="titulo-regras" className={styles.secaoTitulo}>Regras de Pontuação</h2>
        {regras.error ? (
          <p className={styles.erro}>Não foi possível carregar as regras.</p>
        ) : (
          <div className={styles.regras}>
            {regras.data?.map((regra) => (
              <article key={regra.id} className={styles.itemRegra}>
                <Card className={regra.ativo ? styles.regra : `${styles.regra} ${styles.regraInativa}`}>
                  <div className={styles.conteudoRegra}>
                    <span className={styles.pontosRegra}>+{num(regra.pontos)}</span>
                    <div className={styles.textoRegra}>
                      <span className={styles.nomeRegra}>{regra.nome}</span>
                      <span>{regra.descricao}</span>
                      <span>
                        Para: <strong>{regra.aplica_a}</strong>
                        {!regra.ativo && " · regra desativada (não pontua)"}
                      </span>
                    </div>
                  </div>
                </Card>
              </article>
            ))}
          </div>
        )}
      </section>

      <Card aria-labelledby="titulo-podio" aria-busy={podio.isLoading}>
        <h2 id="titulo-podio" className={styles.secaoTitulo}>Top 5 Colaboradores do Período</h2>
        {podio.error ? (
          <p className={styles.erro}>Não foi possível carregar o pódio.</p>
        ) : !podio.data ? (
          <p className={styles.vazio}>Carregando…</p>
        ) : !podio.data.suficiente ? (
          <p className={styles.vazio}>
            <strong>Ainda não há pódio para este período</strong>
            {podio.data.colaboradores_pontuando === 0
              ? "Nenhum colaborador pontuou com esses filtros. Conclua ações e planos para entrar no ranking."
              : `Só ${podio.data.colaboradores_pontuando} colaborador(es) pontuaram; o pódio aparece a partir de ${podio.data.minimo}. Veja a classificação abaixo ou amplie o período.`}
          </p>
        ) : (
          <ol className={styles.podio}>
            {/* Ordem visual 4º · 2º · 1º · 3º · 5º (CSS order); a ordem de leitura continua 1º, 2º, 3º, 4º, 5º. */}
            {podio.data.items.map((c, i) => {
              return (
                <li key={c.usuario_id} className={`${styles.degrau} ${styles[`lugar${i + 1}`]}`} style={{ order: [3, 2, 4, 1, 5][i] }}>
                  <Avatar nome={c.nome} url={c.avatar_url} tamanho={i === 0 ? "xl" : i < 3 ? "lg" : "md"} className={styles.avatarPodio} />
                  <span className={styles.nomePodio}>{c.nome}</span>
                  <span className={styles.pontosPodio}>{num(c.pontos)} pts</span>
                  <span className={styles.base} aria-label={`${c.posicao}º lugar`}>
                    {c.posicao}º
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card aria-labelledby="titulo-ranking" aria-busy={ranking.isLoading}>
        <h2 id="titulo-ranking" className={styles.secaoTitulo}>Classificação Geral da Fábrica</h2>
        {ranking.error ? (
          <p className={styles.erro}>Não foi possível carregar a classificação: {ranking.error.message}</p>
        ) : !ranking.data ? (
          <p className={styles.vazio}>Carregando…</p>
        ) : ranking.data.total === 0 ? (
          <p className={styles.vazio}>
            <strong>Ninguém pontuou neste período</strong>
            Os pontos entram automaticamente quando ações e planos são concluídos.
          </p>
        ) : (
          <>
            <Table className={styles.ranking}>
              <thead>
                <tr>
                  <th scope="col">Posição</th>
                  <th scope="col">Colaborador</th>
                  <th scope="col" data-numerico>Pontuação</th>
                  <th scope="col" data-numerico>Planos fechados</th>
                  <th scope="col" data-numerico>No prazo</th>
                  <th scope="col" data-numerico>Concluídas com atraso</th>
                  <th scope="col">Desempenho</th>
                  <th scope="col">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {ranking.data.items.map((c) => (
                  <tr key={c.usuario_id}>
                    <td className={styles.posicao}>
                      {MEDALHAS[c.posicao] && <Icon name="award" size={16} strokeWidth={2.2} color={`var(${MEDALHAS[c.posicao]})`} className={styles.medalha} />}
                      {c.posicao}º
                    </td>
                    <td>
                      <div className={styles.colaborador}>
                        <Avatar nome={c.nome} url={c.avatar_url} tamanho="sm" />
                        <span>
                          {c.nome}
                          {(c.area || c.setor) && <span className={styles.meta}>{[c.area, c.setor].filter(Boolean).join(" · ")}</span>}
                        </span>
                      </div>
                    </td>
                    <td data-numerico>
                      <strong>{num(c.pontos)}</strong>
                    </td>
                    <td data-numerico>{num(c.planos_fechados)}</td>
                    <td data-numerico>{num(c.acoes_no_prazo)}</td>
                    <td data-numerico>{num(c.acoes_atrasadas)}</td>
                    <td>
                      {c.desempenho === null ? (
                        <span className={styles.meta}>Sem ações entregues</span>
                      ) : (
                        <div className={styles.barra} title="Ações entregues no prazo ÷ ações entregues">
                          <div className={styles.trilho} role="presentation">
                            <div className={styles.preenchimento} style={{ width: `${c.desempenho}%` }} />
                          </div>
                          <span className={styles.num}>{pct(c.desempenho)}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <Tendencia colaborador={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              pagina={page}
              tamanho={pageSize}
              total={ranking.data.total}
              tamanhos={TAMANHOS}
              onPagina={(p) => atualizar({ page: String(p) }, true)}
              onTamanho={(t) => atualizar({ page_size: String(t) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: KpiTom }) {
  return <KpiCard valor={valor} rotulo={rotulo} dica={detalhe} tom={tom} />;
}

function Tendencia({ colaborador: c }: { colaborador: ColaboradorRanking }) {
  const titulo = `Período anterior: ${num(c.pontos_periodo_anterior)} pts`;
  if (c.tendencia === "novo") return <span className={styles.novo} title={titulo}><Icon name="star" size={13} /> Novo</span>;
  if (c.tendencia === "estavel") return <span className={styles.estavel} title={titulo}>= 0</span>;
  const subiu = c.tendencia === "subiu";
  return (
    <span className={subiu ? styles.subiu : styles.caiu} title={titulo}>
      <Icon name={subiu ? "arrowUp" : "arrowDown"} size={13} strokeWidth={2.4} />
      {subiu ? "+" : ""}
      {num(c.variacao)} pts
    </span>
  );
}
