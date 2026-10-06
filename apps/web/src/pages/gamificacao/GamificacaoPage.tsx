import type { FiltrosGamificacao } from "@planogestao/api-client";
import type { CategoriaPontuacao, ColaboradorRanking } from "@planogestao/shared-types";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DetalheParticipante } from "../../components/gamificacao/DetalheParticipante";
import styles from "../../components/gamificacao/Gamificacao.module.css";
import { ROTULO_SITUACAO, textoPremio } from "../../components/gamificacao/rotulos";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { KpiCard, type KpiTom } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import {
  useAtualizarGamificacao,
  useOpcoesGamificacao,
  usePeriodosApuracao,
  usePodio,
  useRanking,
  useRegrasPontuacao,
  useResumoGamificacao,
} from "../../hooks/useGamificacao";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { formatarData, formatarDataHora } from "../../utils/datas";

const TAMANHOS = [10, 20, 50];
const idPositivo = (v: string | null) => (v && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : undefined);
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}%`);
// Medalhas das três primeiras colocações: ícone do kit na cor da medalha (a posição continua escrita ao lado).
const MEDALHAS: Record<number, string> = { 1: "--cor-medalha-ouro", 2: "--cor-medalha-prata", 3: "--cor-medalha-bronze" };
const ABAS: { id: CategoriaPontuacao; rotulo: string }[] = [
  { id: "executor", rotulo: "Executores" },
  { id: "gestor", rotulo: "Gestores" },
];

export function GamificacaoPage() {
  const [params, setParams] = useSearchParams();
  const usuario = useAuthStore((s) => s.usuario);
  const podeAuditar = temPermissao(usuario, "gamificacao:auditoria");
  const podeApurar = ["gamificacao:periodos", "gamificacao:encerrar", "gamificacao:reabrir"].some((p) => temPermissao(usuario, p));
  const categoria: CategoriaPontuacao = params.get("categoria") === "gestor" ? "gestor" : "executor";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 10;
  const [detalhe, setDetalhe] = useState<ColaboradorRanking | null>(null);

  const periodos = usePeriodosApuracao();
  const periodoId = idPositivo(params.get("periodo_id")) ?? periodos.data?.padrao_id ?? undefined;
  const periodo = periodos.data?.items.find((p) => p.id === periodoId);

  // Um único objeto de filtros para cards, pódio e tabela.
  const filtros: FiltrosGamificacao = useMemo(
    () => ({
      periodo_id: periodoId,
      area_id: idPositivo(params.get("area_id")),
      setor_id: idPositivo(params.get("setor_id")),
      equipe_id: idPositivo(params.get("equipe_id")),
    }),
    [params, periodoId],
  );
  const temPeriodo = periodoId !== undefined;

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
  const resumo = useResumoGamificacao(filtros, temPeriodo);
  const podio = usePodio(filtros, categoria, temPeriodo);
  const ranking = useRanking(filtros, categoria, page, pageSize, temPeriodo);
  const recarregar = useAtualizarGamificacao();
  const buscando = resumo.isFetching || podio.isFetching || ranking.isFetching;
  const r = resumo.data;
  const gestores = categoria === "gestor";
  // O detalhamento mostra planos e ações: o próprio participante, ou quem tem a auditoria.
  const podeDetalhar = (c: ColaboradorRanking) => podeAuditar || c.usuario_id === usuario?.id;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Gamificação &amp; Eficiência</h1>
          <p className={styles.subtitulo}>
            {periodo
              ? `${periodo.nome}: conclusões de ${formatarData(periodo.data_inicio)} a ${formatarData(periodo.data_fim)} (horário de Brasília)`
              : "Pontos lançados na conclusão efetiva de planos e ações, apurados por período."}
          </p>
        </div>

        <div className={styles.filtros}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Período de apuração</span>
            <Select compacto value={periodoId ?? ""} onChange={(e) => atualizar({ periodo_id: e.target.value || null })} disabled={!periodos.data?.items.length}>
              {!periodos.data?.items.length && <option value="">Nenhum período</option>}
              {periodos.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {ROTULO_SITUACAO[p.situacao]}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Área</span>
            <Select
              compacto
              value={filtros.area_id ?? ""}
              onChange={(e) => {
                // Função/cargo ou equipe de outra área deixaria o ranking vazio sem motivo aparente.
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
            <span className={styles.rotulo}>Função/Cargo</span>
            <Select compacto value={filtros.setor_id ?? ""} onChange={(e) => atualizar({ setor_id: e.target.value || null })}>
              <option value="">Todas</option>
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
          {podeApurar && <ButtonLink to="/gamificacao/periodos">Períodos e prêmios</ButtonLink>}
          {podeAuditar && <ButtonLink to={periodoId ? `/gamificacao/auditoria?periodo_id=${periodoId}` : "/gamificacao/auditoria"}>Auditoria</ButtonLink>}
        </div>
      </header>

      {periodos.data && !periodos.data.items.length && (
        <p className={styles.vazio}>
          <strong>Nenhum período de apuração cadastrado</strong>
          {podeApurar ? "Cadastre os períodos (ex.: os trimestres do ano) em “Períodos e prêmios”." : "Peça à administração para cadastrar os períodos de apuração."}
        </p>
      )}

      {periodo?.situacao === "encerrado" && (
        <p className={styles.avisoEncerrado} role="status">
          <Icon name="lock" size={15} /> Apuração encerrada{periodo.encerrado_em ? ` em ${formatarDataHora(periodo.encerrado_em)}` : ""}. Este é o
          resultado oficial congelado: mudanças posteriores em planos, ações ou cadastros não o alteram.
        </p>
      )}
      {periodo?.situacao === "planejado" && (
        <p className={styles.aviso}>Período planejado: os pontos aparecem conforme as conclusões acontecerem dentro das datas dele.</p>
      )}

      {temPeriodo &&
        (resumo.error ? (
          <p className={styles.erro}>Não foi possível carregar o resumo: {resumo.error.message}</p>
        ) : (
          <section className={styles.kpis} aria-label="Resumo do período" aria-busy={resumo.isLoading}>
            <Kpi tom="primaria" rotulo="Participantes" valor={r ? num(r.colaboradores) : "…"} detalhe={r ? `${num(r.gestores)} gestor(es) · ${num(r.executores)} executor(es)` : undefined} />
            <Kpi tom="info" rotulo="Planos ativos" valor={r ? num(r.planos_ativos) : "…"} detalhe="Em andamento agora" />
            <Kpi tom="sucesso" rotulo="Planos concluídos" valor={r ? num(r.planos_concluidos) : "…"} detalhe={r ? `${num(r.pontos_gestores)} pts para gestores` : undefined} />
            <Kpi tom="sucesso" rotulo="Ações no prazo" valor={r ? pct(r.percentual_no_prazo) : "…"} detalhe={r ? `${num(r.acoes_no_prazo)} de ${num(r.acoes_concluidas)} ações concluídas` : undefined} />
            <Kpi tom="aviso" rotulo="Pontos distribuídos" valor={r ? num(r.pontos_distribuidos) : "…"} detalhe={r ? `${num(r.pontos_executores)} pts para executores` : undefined} />
          </section>
        ))}

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
        <p className={styles.nota}>
          Vale a data efetiva da conclusão. Ação concluída até o fim do dia do prazo conta como dentro do prazo. Sub-itens não pontuam.
          Mesma pontuação = mesma colocação (sem desempate automático).
        </p>
      </section>

      {temPeriodo && (
        <Tabs abas={ABAS} ativa={categoria} onSelecionar={(id) => atualizar({ categoria: id === "executor" ? null : id })} rotulo="Categoria do ranking">
          <Card aria-labelledby="titulo-podio" aria-busy={podio.isLoading}>
            <h2 id="titulo-podio" className={styles.secaoTitulo}>
              Top 5 {gestores ? "Gestores" : "Executores"} do Período
            </h2>
            {podio.error ? (
              <p className={styles.erro}>Não foi possível carregar o pódio.</p>
            ) : !podio.data ? (
              <p className={styles.vazio}>Carregando…</p>
            ) : !podio.data.suficiente ? (
              <p className={styles.vazio}>
                <strong>Ainda não há pódio para este período</strong>
                {podio.data.colaboradores_pontuando === 0
                  ? `Nenhum ${gestores ? "gestor" : "executor"} pontuou com esses filtros.`
                  : `Só ${podio.data.colaboradores_pontuando} participante(s) pontuaram; o pódio aparece a partir de ${podio.data.minimo}. Veja a classificação abaixo.`}
              </p>
            ) : (
              <ol className={styles.podio}>
                {/* Ordem visual 4º · 2º · 1º · 3º · 5º (CSS order); a ordem de leitura continua a da classificação. */}
                {podio.data.items.slice(0, 5).map((c, i) => (
                  <li key={c.usuario_id} className={`${styles.degrau} ${styles[`lugar${i + 1}`]}`} style={{ order: [3, 2, 4, 1, 5][i] }}>
                    <Avatar nome={c.nome} url={c.avatar_url} tamanho={i === 0 ? "xl" : i < 3 ? "lg" : "md"} className={styles.avatarPodio} />
                    <span className={styles.nomePodio}>{c.nome}</span>
                    <span className={styles.pontosPodio}>{num(c.pontos)} pts</span>
                    {c.premio && <span className={styles.premioPodio}>{textoPremio(c.premio)}</span>}
                    {c.premio_pendente && <span className={styles.premioPodio}>Prêmio pendente (empate)</span>}
                    <span className={styles.base} aria-label={`${c.posicao}º lugar${c.empatado ? ", empatado" : ""}`}>
                      {c.posicao}º{c.empatado ? "*" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card aria-labelledby="titulo-ranking" aria-busy={ranking.isLoading}>
            <h2 id="titulo-ranking" className={styles.secaoTitulo}>
              Classificação — {gestores ? "Gestores (responsáveis pelos planos)" : "Executores (responsáveis pelas ações)"}
            </h2>
            {ranking.error ? (
              <p className={styles.erro}>Não foi possível carregar a classificação: {ranking.error.message}</p>
            ) : !ranking.data ? (
              <p className={styles.vazio}>Carregando…</p>
            ) : ranking.data.total === 0 ? (
              <p className={styles.vazio}>
                <strong>Ninguém pontuou nesta categoria</strong>
                {gestores ? "Gestores pontuam quando um plano sob sua responsabilidade é concluído." : "Executores pontuam ao concluir ações sob sua responsabilidade."}
              </p>
            ) : (
              <>
                <Table className={styles.ranking}>
                  <thead>
                    <tr>
                      <th scope="col">Colocação</th>
                      <th scope="col">{gestores ? "Gestor" : "Executor"}</th>
                      <th scope="col" data-numerico>Pontuação</th>
                      {gestores ? (
                        <th scope="col" data-numerico>Planos concluídos</th>
                      ) : (
                        <>
                          <th scope="col" data-numerico>Dentro do prazo</th>
                          <th scope="col" data-numerico>Fora do prazo</th>
                          <th scope="col">Desempenho</th>
                        </>
                      )}
                      <th scope="col">Prêmio</th>
                      <th scope="col">Tendência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.data.items.map((c) => (
                      <tr key={c.usuario_id}>
                        <td className={styles.posicao}>
                          {MEDALHAS[c.posicao] && <Icon name="award" size={16} strokeWidth={2.2} color={`var(${MEDALHAS[c.posicao]})`} className={styles.medalha} />}
                          {c.posicao}º
                          {c.empatado && (
                            <span className={styles.meta} title="Mesma pontuação: mesma colocação">
                              empate
                            </span>
                          )}
                        </td>
                        <td>
                          <div className={styles.colaborador}>
                            <Avatar nome={c.nome} url={c.avatar_url} tamanho="sm" />
                            <span>
                              {podeDetalhar(c) ? (
                                <button type="button" className={styles.linkNome} onClick={() => setDetalhe(c)}>
                                  {c.nome}
                                </button>
                              ) : (
                                c.nome
                              )}
                              {(c.area || c.setor) && <span className={styles.meta}>{[c.area, c.setor].filter(Boolean).join(" · ")}</span>}
                            </span>
                          </div>
                        </td>
                        <td data-numerico>
                          <strong>{num(c.pontos)}</strong>
                        </td>
                        {gestores ? (
                          <td data-numerico>{num(c.planos_concluidos)}</td>
                        ) : (
                          <>
                            <td data-numerico>{num(c.acoes_no_prazo)}</td>
                            <td data-numerico>{num(c.acoes_fora_prazo)}</td>
                            <td>
                              {c.desempenho === null ? (
                                <span className={styles.meta}>Sem ações entregues</span>
                              ) : (
                                <div className={styles.barra} title="Ações dentro do prazo ÷ ações concluídas">
                                  <div className={styles.trilho} role="presentation">
                                    <div className={styles.preenchimento} style={{ width: `${c.desempenho}%` }} />
                                  </div>
                                  <span className={styles.num}>{pct(c.desempenho)}</span>
                                </div>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          {c.premio ? (
                            <span title={c.premio.descricao ?? undefined}>{textoPremio(c.premio)}</span>
                          ) : c.premio_pendente ? (
                            <Badge tom="aviso" tamanho="sm" title={`Empate disputando o prêmio de ${c.colocacoes_disputadas.map((x) => `${x}º`).join(", ")}`}>
                              Pendente (empate)
                            </Badge>
                          ) : (
                            <span className={styles.meta}>—</span>
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
        </Tabs>
      )}

      <DetalheParticipante participante={detalhe} periodoId={periodoId} categoria={categoria} onFechar={() => setDetalhe(null)} />
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: KpiTom }) {
  return <KpiCard valor={valor} rotulo={rotulo} dica={detalhe} tom={tom} />;
}

function Tendencia({ colaborador: c }: { colaborador: ColaboradorRanking }) {
  const titulo = `Período de apuração anterior: ${num(c.pontos_periodo_anterior)} pts`;
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
