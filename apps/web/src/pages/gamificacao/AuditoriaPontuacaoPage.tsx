import type { FiltrosAuditoria } from "@planogestao/api-client";
import type { CategoriaPontuacao, ClassificacaoPontuacao, ItemPontuacao } from "@planogestao/shared-types";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import local from "../../components/gamificacao/Apuracao.module.css";
import styles from "../../components/gamificacao/Gamificacao.module.css";
import { ROTULO_CATEGORIA, ROTULO_CLASSIFICACAO, ROTULO_EVENTO, ROTULO_ORIGEM, ROTULO_SITUACAO } from "../../components/gamificacao/rotulos";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Textarea } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { useAuditoriaPontuacao, useMutacaoGamificacao, usePeriodosApuracao } from "../../hooks/useGamificacao";
import { api } from "../../services/api";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { baixarArquivo } from "../../utils/download";
import { formatarData, formatarDataHora } from "../../utils/datas";

const idPositivo = (v: string | null) => (v && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : undefined);
const num = (v: number) => v.toLocaleString("pt-BR");
const CATEGORIAS: CategoriaPontuacao[] = ["gestor", "executor"];
const CLASSIFICACOES = Object.keys(ROTULO_CLASSIFICACAO) as ClassificacaoPontuacao[];

export function AuditoriaPontuacaoPage() {
  const [params, setParams] = useSearchParams();
  const usuario = useAuthStore((s) => s.usuario);
  const podeExportar = temPermissao(usuario, "gamificacao:exportar");
  const podeCorrigir = temPermissao(usuario, "gamificacao:periodos");
  const periodos = usePeriodosApuracao();
  const periodoId = idPositivo(params.get("periodo_id")) ?? periodos.data?.padrao_id ?? undefined;
  const [corrigindo, setCorrigindo] = useState<ItemPontuacao | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erroExportar, setErroExportar] = useState<string | null>(null);

  const categoriaParam = params.get("categoria");
  const classificacaoParam = params.get("classificacao");
  const filtros: FiltrosAuditoria = useMemo(
    () => ({
      periodo_id: periodoId,
      categoria: CATEGORIAS.includes(categoriaParam as CategoriaPontuacao) ? (categoriaParam as CategoriaPontuacao) : undefined,
      usuario_id: idPositivo(params.get("usuario_id")),
      plano_id: idPositivo(params.get("plano_id")),
      acao_id: idPositivo(params.get("acao_id")),
      classificacao: CLASSIFICACOES.includes(classificacaoParam as ClassificacaoPontuacao) ? (classificacaoParam as ClassificacaoPontuacao) : undefined,
    }),
    [params, periodoId, categoriaParam, classificacaoParam],
  );
  const relatorio = useAuditoriaPontuacao(filtros);
  const d = relatorio.data;

  const atualizar = (mudancas: Record<string, string | null>) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual);
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (!valor) p.delete(chave);
          else p.set(chave, valor);
        }
        return p;
      },
      { replace: true },
    );

  const exportar = async () => {
    setExportando(true);
    setErroExportar(null);
    try {
      const arquivo = await api.gamificacao.exportarAuditoria(filtros);
      baixarArquivo(arquivo.blob, arquivo.nomeArquivo);
    } catch (e) {
      setErroExportar(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  };

  const filtro = (rotulo: string, chave: string, valor: number | string | undefined, opcoes: [number | string, string][], todos?: string) => (
    <label className={styles.campo}>
      <span className={styles.rotulo}>{rotulo}</span>
      <Select compacto value={valor ?? ""} onChange={(e) => atualizar({ [chave]: e.target.value || null })}>
        {todos && <option value="">{todos}</option>}
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Auditoria da pontuação</h1>
          <p className={styles.subtitulo}>
            Cada linha é um lançamento válido do período, com a regra e o prazo considerados no momento da conclusão. Os totais coincidem com o ranking.
          </p>
        </div>
        <div className={styles.filtros}>
          <ButtonLink to={periodoId ? `/gamificacao?periodo_id=${periodoId}` : "/gamificacao"}>Voltar ao ranking</ButtonLink>
          {podeExportar && (
            <Button variante="primaria" onClick={() => void exportar()} disabled={exportando || !d}>
              {exportando ? "Exportando…" : "Exportar Excel"}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.filtros}>
        {filtro("Período", "periodo_id", periodoId, (periodos.data?.items ?? []).map((p) => [p.id, `${p.nome} · ${ROTULO_SITUACAO[p.situacao]}`]))}
        {filtro("Categoria", "categoria", filtros.categoria, CATEGORIAS.map((c) => [c, ROTULO_CATEGORIA[c]]), "Todas")}
        {filtro("Participante", "usuario_id", filtros.usuario_id, d?.opcoes.participantes ?? [], "Todos")}
        {filtro("Plano", "plano_id", filtros.plano_id, d?.opcoes.planos ?? [], "Todos")}
        {filtro("Ação", "acao_id", filtros.acao_id, d?.opcoes.acoes ?? [], "Todas")}
        {filtro("Classificação", "classificacao", filtros.classificacao, CLASSIFICACOES.map((c) => [c, ROTULO_CLASSIFICACAO[c]]), "Todas")}
      </div>
      {erroExportar && (
        <p className={styles.erro} role="alert">
          {erroExportar}
        </p>
      )}

      {relatorio.error ? (
        <p className={styles.erro}>Não foi possível carregar a auditoria: {relatorio.error.message}</p>
      ) : !d ? (
        <p className={styles.vazio}>Carregando…</p>
      ) : (
        <>
          {d.encerrado && (
            <p className={styles.avisoEncerrado}>Período encerrado: estas linhas são a fotografia guardada no encerramento.</p>
          )}
          <Card aria-labelledby="titulo-lancamentos">
            <h2 id="titulo-lancamentos" className={styles.secaoTitulo}>
              Lançamentos — {d.periodo_nome}
            </h2>
            <p className={local.totais}>
              <span>
                Relatório (filtros): <strong>{num(d.total_pontos)} pts</strong> em {num(d.total_lancamentos)} lançamento(s)
              </span>
              <span>
                Período inteiro: <strong>{num(d.total_periodo)} pts</strong> · ranking: <strong>{num(d.total_ranking)} pts</strong>{" "}
                <span className={d.total_periodo === d.total_ranking ? local.confere : local.diverge}>
                  {d.total_periodo === d.total_ranking ? "✓ confere" : "✗ diverge"}
                </span>
              </span>
            </p>
            {!d.items.length ? (
              <p className={styles.vazio}>Nenhum lançamento com esses filtros.</p>
            ) : (
              <Table className={styles.ranking}>
                <thead>
                  <tr>
                    <th scope="col">Lançamento</th>
                    <th scope="col">Participante</th>
                    <th scope="col">Plano</th>
                    <th scope="col">Ação</th>
                    <th scope="col">Conclusão efetiva</th>
                    <th scope="col">Prazo</th>
                    <th scope="col">Classificação</th>
                    <th scope="col" data-numerico>Pontos</th>
                    {podeCorrigir && !d.encerrado && <th scope="col">Correção</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.lancamento_id}>
                      <td>
                        #{i.lancamento_id}
                        <span className={styles.meta}>{ROTULO_ORIGEM[i.origem] ?? i.origem}</span>
                      </td>
                      <td>
                        {i.participante}
                        <span className={styles.meta}>{ROTULO_CATEGORIA[i.categoria]}</span>
                      </td>
                      <td>
                        <Link to={`/planos/${i.plano_id}`}>{i.plano_codigo ?? `#${i.plano_id}`}</Link>
                        <span className={styles.meta}>{i.plano_nome}</span>
                      </td>
                      <td>
                        {i.acao_id ? (
                          <>
                            <Link to={`/acoes/${i.acao_id}`}>Ação {i.acao_codigo ?? `#${i.acao_id}`}</Link>
                            <span className={styles.meta}>{i.acao_descricao}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatarDataHora(i.concluido_em)}</td>
                      <td>{i.prazo ? formatarData(i.prazo) : "—"}</td>
                      <td>
                        {ROTULO_CLASSIFICACAO[i.classificacao]}
                        <span className={styles.meta}>{i.regra}</span>
                      </td>
                      <td data-numerico>
                        <strong>{i.pontos}</strong>
                      </td>
                      {podeCorrigir && !d.encerrado && (
                        <td>
                          <Button tamanho="sm" onClick={() => setCorrigindo(i)}>
                            Recalcular item…
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card aria-labelledby="titulo-totais">
            <h2 id="titulo-totais" className={styles.secaoTitulo}>Totais por participante e categoria</h2>
            {!d.totais.length ? (
              <p className={styles.vazio}>Sem totais.</p>
            ) : (
              <Table className={styles.ranking}>
                <thead>
                  <tr>
                    <th scope="col">Participante</th>
                    <th scope="col">Categoria</th>
                    <th scope="col" data-numerico>Lançamentos</th>
                    <th scope="col" data-numerico>Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {d.totais.map((t) => (
                    <tr key={`${t.usuario_id}-${t.categoria}`}>
                      <td>{t.participante}</td>
                      <td>{ROTULO_CATEGORIA[t.categoria]}</td>
                      <td data-numerico>{num(t.lancamentos)}</td>
                      <td data-numerico>
                        <strong>{num(t.pontos)}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}>
                      <strong>Total</strong>
                    </td>
                    <td data-numerico>{num(d.total_lancamentos)}</td>
                    <td data-numerico>
                      <strong>{num(d.total_pontos)}</strong>
                    </td>
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>

          <Card aria-labelledby="titulo-historico">
            <h2 id="titulo-historico" className={styles.secaoTitulo}>Histórico de ajustes, reversões, reaberturas e encerramentos</h2>
            {!d.eventos.length ? (
              <p className={styles.vazio}>Nenhum evento registrado para este período.</p>
            ) : (
              <Table className={styles.ranking}>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Evento</th>
                    <th scope="col">Autor</th>
                    <th scope="col">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {d.eventos.map((e) => (
                    <tr key={e.id}>
                      <td>{formatarDataHora(e.criado_em)}</td>
                      <td>{ROTULO_EVENTO[e.evento] ?? e.evento}</td>
                      <td>{e.autor}</td>
                      <td>
                        {e.detalhe}
                        {e.justificativa && <span className={local.justificativa}>Justificativa: {e.justificativa}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {corrigindo && <Corrigir item={corrigindo} onFechar={() => setCorrigindo(null)} />}
    </div>
  );
}

function Corrigir({ item, onFechar }: { item: ItemPontuacao; onFechar: () => void }) {
  const [justificativa, setJustificativa] = useState("");
  const corrigir = useMutacaoGamificacao(() => api.gamificacao.corrigirLancamento(item.lancamento_id, justificativa.trim()));
  return (
    <Modal
      aberto
      titulo={`Recalcular lançamento #${item.lancamento_id}`}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={justificativa.trim().length < 10 || corrigir.isPending}
            onClick={() => corrigir.mutate(undefined, { onSuccess: onFechar })}
          >
            Reverter e recalcular
          </Button>
        </>
      }
    >
      <p className={styles.nota}>
        {item.participante} · {item.plano_codigo}
        {item.acao_codigo ? ` · Ação ${item.acao_codigo}` : ""} · {item.pontos} pts ({ROTULO_CLASSIFICACAO[item.classificacao]}).
      </p>
      <p className={styles.nota}>
        O lançamento atual é revertido e um novo é gerado com os dados de hoje do item (responsável, prazo e data de conclusão). Use quando um
        responsável ou prazo foi corrigido depois da conclusão. Tudo fica no histórico.
      </p>
      <Field id="corr-just" rotulo="Justificativa" obrigatorio ajuda="Pelo menos 10 caracteres.">
        <Textarea id="corr-just" value={justificativa} rows={3} maxLength={500} onChange={(e) => setJustificativa(e.target.value)} />
      </Field>
      {corrigir.error && (
        <p className={styles.erro} role="alert">
          {corrigir.error.message}
        </p>
      )}
    </Modal>
  );
}
