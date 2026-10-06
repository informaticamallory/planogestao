import type { AcaoDoPlano, CategoriaAcao, PlanoDetalhe, TagPrazo } from "@planogestao/shared-types";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAcoesDoPlano, useAdicionarAcoes, useOperacaoAcao, type OperacaoAcao } from "../../../hooks/usePlano";
import { usePreferencia } from "../../../hooks/usePreferencia";
import { formatarData } from "../../../utils/datas";
import { COR_CATEGORIA, ROTULO_CATEGORIA_ACAO, ROTULO_PRAZO, ROTULO_PRIORIDADE } from "../../../utils/rotulos";
import { Button, classesDoBotao } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Drawer } from "../../ui/Drawer";
import { DropdownItem, DropdownMenu } from "../../ui/DropdownMenu";
import { Icon } from "../../ui/Icon";
import { Checkbox } from "../../ui/Input";
import { ProgressBar } from "../../ui/ProgressBar";
import { ActionStatusBadge } from "../../ui/StatusBadges";
import { Table } from "../../ui/Table";
import { ConfirmarOperacao } from "../ConfirmarOperacao";
import { EtapaAcoes } from "../novo/EtapaAcoes";
import { acoesParaApi, novaAcao, validarListaAcoes, type AcaoForm } from "../novo/formularioPlano";
import styles from "./AbasPlano.module.css";

type Visao = "tabela" | "kanban";
const ehVisao = (v: unknown): v is Visao => v === "tabela" || v === "kanban";

/**
 * Filtro da aba (vem dos cartões do plano, na URL): um status de execução ou uma tag de prazo.
 * São independentes: "Em atraso" lista itens não iniciados e em andamento com o prazo vencido.
 */
export type FiltroAcoes = CategoriaAcao | TagPrazo;
const ROTULO_FILTRO: Record<FiltroAcoes, string> = { ...ROTULO_CATEGORIA_ACAO, ...ROTULO_PRAZO };
const ehCategoria = (f: FiltroAcoes): f is CategoriaAcao => f in ROTULO_CATEGORIA_ACAO;

export function lerFiltroAcoes(v: string | null): FiltroAcoes | null {
  if (v === "atrasada") return "em_atraso"; // links antigos (a categoria "atrasada" virou tag de prazo)
  return v !== null && v in ROTULO_FILTRO ? (v as FiltroAcoes) : null;
}

const atende = (a: AcaoDoPlano, f: FiltroAcoes) => (ehCategoria(f) ? a.categoria === f : a.prazo_tag === f);

// Colunas do kanban: os 3 status de execução (mesmas cores do dashboard) + descartadas.
const COLUNAS: { id: CategoriaAcao | "descartadas"; titulo: string; token: string }[] = [
  ...(["pendente", "em_andamento", "concluida"] as const).map((c) => ({ id: c, titulo: ROTULO_CATEGORIA_ACAO[c], token: COR_CATEGORIA[c] })),
  { id: "descartadas", titulo: "Recusadas/Canceladas", token: "--cor-dado-neutro" },
];

const colunaDe = (a: AcaoDoPlano) => a.categoria ?? "descartadas";

interface Props {
  plano: PlanoDetalhe;
  filtroCategoria: FiltroAcoes | null;
  onFiltrar: (filtro: FiltroAcoes | null) => void;
}

export function AbaAcoes({ plano, filtroCategoria, onFiltrar }: Props) {
  const navigate = useNavigate();
  const { data: acoes, isLoading, error } = useAcoesDoPlano(plano.id);
  const [visao, setVisao] = usePreferencia<Visao>("plano:acoes:visao", "tabela", ehVisao);
  const [adicionando, setAdicionando] = useState(false);
  // Árvore: itens contraídos (os descendentes somem da tabela; nada é perdido).
  const [contraidos, setContraidos] = useState<Set<number>>(() => new Set());
  // Arquivadas individualmente ficam escondidas por padrão (consulta explícita).
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [confirmando, setConfirmando] = useState<{ acao: AcaoDoPlano; operacao: OperacaoAcao } | null>(null);
  const operacao = useOperacaoAcao(plano.id);
  const planoArquivado = plano.arquivado_em !== null;

  if (isLoading) return <p className={styles.estado}>Carregando ações…</p>;
  if (error || !acoes) return <p className={styles.erro}>Não foi possível carregar as ações.</p>;

  const arquivadas = acoes.filter((a) => a.arquivada).length;
  const listadas = mostrarArquivadas ? acoes : acoes.filter((a) => !a.arquivada);
  const pai = new Map(acoes.map((a) => [a.id, a.acao_pai_id]));
  const escondido = (a: AcaoDoPlano) => {
    for (let p = a.acao_pai_id; p !== null && p !== undefined; p = pai.get(p) ?? null) if (contraidos.has(p)) return true;
    return false;
  };
  // Com filtro a lista é plana (a árvore esconderia itens que batem com o filtro).
  const visiveis = filtroCategoria ? listadas.filter((a) => atende(a, filtroCategoria)) : listadas.filter((a) => !escondido(a));
  const abrir = (a: AcaoDoPlano) => navigate(`/acoes/${a.id}`);
  const alternar = (id: number) =>
    setContraidos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  const comFilhos = acoes.filter((a) => a.subacoes_diretas > 0).map((a) => a.id);
  const temOperacoes = acoes.some((a) => a.operacoes.editar || a.operacoes.arquivar || a.operacoes.desarquivar || a.operacoes.excluir);
  const rotulo = (a: AcaoDoPlano) => `${a.acao_pai_id ? "Sub-item" : "Ação"} ${a.numero}`;
  const pedir = (a: AcaoDoPlano, op: OperacaoAcao) => {
    operacao.reset();
    setConfirmando({ acao: a, operacao: op });
  };
  const arquivoDe = (a: AcaoDoPlano) => (planoArquivado ? "plano" : a.arquivada ? "acao" : null);

  /** Mesmas operações na tabela e no Kanban (o backend revalida permissão e área). */
  const menuDaAcao = (a: AcaoDoPlano) =>
    a.operacoes.editar || a.operacoes.arquivar || a.operacoes.desarquivar || a.operacoes.excluir ? (
      <DropdownMenu rotulo={<Icon name="more" size={16} strokeWidth={2.6} />} ariaLabel={`Operações: ${rotulo(a)}`} classeBotao={classesDoBotao({ variante: "icone", tamanho: "sm" })}>
        {(fechar) => (
          <>
            {a.operacoes.editar && <DropdownItem onClick={() => (fechar(), abrir(a))}>Editar</DropdownItem>}
            {a.operacoes.arquivar && <DropdownItem onClick={() => (fechar(), pedir(a, "arquivar"))}>Arquivar</DropdownItem>}
            {a.operacoes.desarquivar && <DropdownItem onClick={() => (fechar(), pedir(a, "desarquivar"))}>Desarquivar</DropdownItem>}
            {a.operacoes.excluir && (
              <DropdownItem perigo onClick={() => (fechar(), pedir(a, "excluir"))}>
                Excluir
              </DropdownItem>
            )}
          </>
        )}
      </DropdownMenu>
    ) : null;

  return (
    <div className={styles.aba}>
      <div className={styles.barraAba}>
        <div className={styles.grupoBotoes} role="group" aria-label="Visualização">
          {(["tabela", "kanban"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visao === v}
              className={visao === v ? `${styles.alternador} ${styles.alternadorAtivo}` : styles.alternador}
              onClick={() => setVisao(v)}
            >
              {v === "tabela" ? "Tabela" : "Kanban"}
            </button>
          ))}
        </div>
        {filtroCategoria && (
          <span className={styles.filtroAtivo}>
            Filtrando: {ROTULO_FILTRO[filtroCategoria]}
            <Button variante="link" onClick={() => onFiltrar(null)}>
              Limpar
            </Button>
          </span>
        )}
        {visao === "tabela" && !filtroCategoria && comFilhos.length > 0 && (
          <>
            <Button variante="link" onClick={() => setContraidos(new Set())}>
              Expandir tudo
            </Button>
            <Button variante="link" onClick={() => setContraidos(new Set(comFilhos))}>
              Contrair tudo
            </Button>
          </>
        )}
        {arquivadas > 0 && (
          <Checkbox rotulo={`Mostrar arquivadas (${arquivadas})`} checked={mostrarArquivadas} onChange={(e) => setMostrarArquivadas(e.target.checked)} />
        )}
        <span className={styles.espaco} />
        {plano.permissoes.adicionar_acoes && (
          <Button variante="primaria" onClick={() => setAdicionando(true)}>
            + Adicionar ações
          </Button>
        )}
      </div>

      {acoes.length === 0 ? (
        <p className={styles.estado}>Este plano ainda não tem ações.</p>
      ) : visao === "tabela" ? (
        <Card semPadding>
          <Table className={styles.tabela}>
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Ação</th>
                <th scope="col">Área / Setor</th>
                <th scope="col">Responsável</th>
                <th scope="col">Início estimado</th>
                <th scope="col">Prazo de conclusão</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Status</th>
                <th scope="col">Progresso</th>
                {temOperacoes && (
                  <th scope="col" data-acoes>
                    <span className="sr-only">Operações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((a) => (
                <tr
                  key={a.id}
                  className={a.acao_pai_id ? `${styles.linhaClicavel} ${styles.linhaSubacao}` : styles.linhaClicavel}
                  onClick={() => abrir(a)}
                >
                  <td className={styles.numero} style={filtroCategoria ? undefined : { paddingLeft: `calc(var(--espaco-3) + ${a.nivel * 1.25}rem)` }}>
                    <span className={styles.celulaArvore}>
                      {!filtroCategoria && a.subacoes_diretas > 0 ? (
                        <button
                          type="button"
                          className={styles.botaoArvore}
                          aria-expanded={!contraidos.has(a.id)}
                          aria-label={`${contraidos.has(a.id) ? "Expandir" : "Contrair"} ${a.acao_pai_id ? "sub-item" : "ação"} ${a.numero}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            alternar(a.id);
                          }}
                        >
                          <Icon name={contraidos.has(a.id) ? "chevronRight" : "chevronDown"} size={14} />
                        </button>
                      ) : (
                        <span className={styles.espacoArvore} aria-hidden="true" />
                      )}
                      {a.numero}
                    </span>
                  </td>
                  <td className={styles.colunaTexto}>
                    {a.acao_pai_id && <span className={styles.marcaSubacao}>Sub-item · </span>}
                    <Link to={`/acoes/${a.id}`} onClick={(e) => e.stopPropagation()} className={styles.linkAcao}>
                      {a.descricao}
                    </Link>
                    {a.subacoes_diretas > 0 && (
                      <span className={styles.contagemArvore}>
                        {" "}
                        {a.subacoes_diretas} direta{a.subacoes_diretas === 1 ? "" : "s"} · {a.total_descendentes} no total
                      </span>
                    )}
                    <SeloAguardando acao={a} />
                  </td>
                  <td>
                    {a.area.nome}
                    {a.setor && <span className={styles.vencendo}> / {a.setor.nome}</span>}
                  </td>
                  <td>{a.responsavel.nome}</td>
                  <td className={styles.numero}>{a.prazo_inicio ? formatarData(a.prazo_inicio) : "—"}</td>
                  <td className={styles.numero}>{formatarData(a.prazo)}</td>
                  <td>{ROTULO_PRIORIDADE[a.prioridade]}</td>
                  <td>
                    {/* Status e tag de prazo lado a lado (independentes). */}
                    <ActionStatusBadge status={a.status} prazoTag={a.prazo_tag} arquivo={arquivoDe(a)} />
                  </td>
                  <td className={styles.colunaProgresso}>
                    <ProgressBar valor={a.progresso} rotulo={`Progresso da ação ${a.descricao}`} />
                  </td>
                  {temOperacoes && (
                    <td data-acoes onClick={(e) => e.stopPropagation()}>
                      {menuDaAcao(a)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          {visiveis.length === 0 && <p className={styles.estado}>Nenhuma ação nesta categoria.</p>}
        </Card>
      ) : (
        <div className={styles.kanban}>
          {/* Filtro de status: só a coluna dele; filtro de prazo: as colunas com os itens daquela tag. */}
          {COLUNAS.filter((c) => !filtroCategoria || (ehCategoria(filtroCategoria) ? c.id === filtroCategoria : c.id !== "descartadas")).map((coluna) => {
            const itens = listadas.filter((a) => colunaDe(a) === coluna.id && (!filtroCategoria || atende(a, filtroCategoria)));
            return (
              <section key={coluna.id} className={styles.colunaKanban} aria-label={coluna.titulo}>
                <h3 className={styles.tituloColuna} style={{ borderTopColor: `var(${coluna.token})` }}>
                  {coluna.titulo} <span className={styles.contagem}>{itens.length}</span>
                </h3>
                {itens.map((a) => (
                  <article key={a.id} className={`${styles.cartaoKanban} ${a.arquivada ? styles.cartaoArquivado : ""}`}>
                    <div className={styles.topoCartao}>
                      <Link to={`/acoes/${a.id}`} className={styles.descricaoCartao}>
                        {rotulo(a)} — {a.descricao}
                      </Link>
                      {menuDaAcao(a)}
                    </div>
                    <span className={styles.metaCartao}>
                      {a.responsavel.nome} · {a.area.nome} · {formatarData(a.prazo)}
                    </span>
                    <div className={styles.tagsCartao}>
                      <ActionStatusBadge status={a.status} prazoTag={a.prazo_tag} arquivo={arquivoDe(a)} />
                    </div>
                    <SeloAguardando acao={a} />
                    <ProgressBar valor={a.progresso} rotulo={`Progresso da ação ${a.descricao}`} />
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {confirmando && (
        <ConfirmarOperacao
          aberto
          titulo={
            confirmando.operacao === "excluir"
              ? `Excluir ${confirmando.acao.acao_pai_id ? "sub-item" : "ação"}?`
              : confirmando.operacao === "arquivar"
                ? `Arquivar ${confirmando.acao.acao_pai_id ? "sub-item" : "ação"}?`
                : "Desarquivar?"
          }
          identificacao={`${plano.codigo} · ${rotulo(confirmando.acao)} — ${confirmando.acao.descricao}`}
          rotuloBotao={confirmando.operacao === "excluir" ? "Excluir" : confirmando.operacao === "arquivar" ? "Arquivar" : "Desarquivar"}
          destrutiva={confirmando.operacao === "excluir"}
          pendente={operacao.isPending}
          erro={operacao.error?.message}
          onFechar={() => setConfirmando(null)}
          onConfirmar={() =>
            operacao.mutate({ acaoId: confirmando.acao.id, operacao: confirmando.operacao }, { onSuccess: () => setConfirmando(null) })
          }
        >
          {confirmando.operacao === "excluir" ? (
            <>
              <p>
                {confirmando.acao.total_descendentes > 0
                  ? `Os ${confirmando.acao.total_descendentes} sub-item(ns) abaixo também serão excluídos.`
                  : "Este item não tem sub-itens."}{" "}
                Tudo sai das listas, de Minhas Ações, do calendário, dos totais e dos lembretes.
              </p>
              <p>
                As ações não têm anexos próprios: os anexos do plano não são afetados. O histórico fica guardado para auditoria; pontos de
                apurações abertas são revertidos (os de apurações encerradas não mudam).
              </p>
            </>
          ) : confirmando.operacao === "arquivar" ? (
            <p>
              {confirmando.acao.total_descendentes > 0 ? `O item e os ${confirmando.acao.total_descendentes} sub-item(ns) abaixo` : "O item"} saem das listas
              operacionais e do cálculo do plano e ficam somente leitura. Status e prazos originais são preservados. Arquivar não conclui o
              plano nem gera pontos.
            </p>
          ) : (
            <p>O item volta às listas e ao cálculo do plano, com a situação de prazo recalculada pelas datas. Sub-itens arquivados à parte continuam arquivados.</p>
          )}
        </ConfirmarOperacao>
      )}

      {adicionando && <DrawerNovasAcoes plano={plano} acoesExistentes={acoes} onFechar={() => setAdicionando(false)} />}
    </div>
  );
}

/** "Aguardando ação anterior": pré-requisitos ainda não concluídos (na subação, os da ação principal). */
function SeloAguardando({ acao }: { acao: AcaoDoPlano }) {
  if (acao.aguardando.length === 0 || acao.categoria === "concluida" || acao.categoria === null) return null;
  const rotulo = (n: string) => `${n.includes(".") ? "Sub-item" : "Ação"} ${n}`;
  const quais = acao.aguardando.map((p) => rotulo(p.numero)).join(", ");
  return (
    <span className={styles.seloAguardando} title={acao.aguardando.map((p) => `${rotulo(p.numero)} — ${p.descricao}`).join("\n")}>
      {/* Já iniciada e o pré-requisito voltou a ficar aberto (reaberto): sinaliza para revisão. */}
      {acao.revisar_prerequisito ? `Revisar: pré-requisito reaberto (${quais})` : `Aguardando ação anterior: ${quais}`}
    </span>
  );
}

function DrawerNovasAcoes({ plano, acoesExistentes, onFechar }: { plano: PlanoDetalhe; acoesExistentes: AcaoDoPlano[]; onFechar: () => void }) {
  // A 1ª nova ação parte da área/setor do plano.
  const [acoes, setAcoes] = useState<AcaoForm[]>(() => [
    { ...novaAcao(plano.prioridade), area_id: String(plano.area.id), setor_id: plano.setor ? String(plano.setor.id) : "" },
  ]);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const adicionar = useAdicionarAcoes(plano.id);
  const erros = mostrarErros ? validarListaAcoes(acoes) : {};

  const salvar = () => {
    setMostrarErros(true);
    if (acoes.length === 0 || Object.keys(validarListaAcoes(acoes)).length) return;
    adicionar.mutate(acoesParaApi(acoes), {
      onSuccess: (r) => (r.avisos.length ? setAvisos(r.avisos) : onFechar()),
    });
  };

  return (
    <Drawer
      aberto
      titulo="Adicionar ações"
      onFechar={onFechar}
      rodape={
        avisos.length ? (
          <Button variante="primaria" onClick={onFechar}>
            Fechar
          </Button>
        ) : (
          <>
            {adicionar.isError && <span className={styles.erro}>{adicionar.error.message}</span>}
            <Button onClick={onFechar}>Cancelar</Button>
            <Button variante="primaria" onClick={salvar} disabled={adicionar.isPending || acoes.length === 0}>
              {adicionar.isPending ? "Salvando…" : `Salvar ${acoes.length} ação(ões)`}
            </Button>
          </>
        )
      }
    >
      {avisos.length ? (
        <div role="status">
          <p>Ações adicionadas, com avisos:</p>
          <ul>
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : (
        <EtapaAcoes
          acoes={acoes}
          onAlterar={setAcoes}
          fimEstimado={plano.data_fim_estimado}
          prioridadePadrao={plano.prioridade}
          erros={erros}
          acoesExistentes={acoesExistentes}
        />
      )}
    </Drawer>
  );
}
