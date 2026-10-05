import type { CategoriaPontuacao, PeriodoApuracao, PremioEntrada } from "@planogestao/shared-types";
import { useState } from "react";

import styles from "../../components/gamificacao/Gamificacao.module.css";
import local from "../../components/gamificacao/Apuracao.module.css";
import { ROTULO_CATEGORIA, ROTULO_SITUACAO, TOM_SITUACAO, textoPremio } from "../../components/gamificacao/rotulos";
import { Badge } from "../../components/ui/Badge";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input, Textarea } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import {
  useInconsistencias,
  useMutacaoGamificacao,
  usePeriodosApuracao,
  useVerificacaoEncerramento,
} from "../../hooks/useGamificacao";
import { api } from "../../services/api";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { formatarData, formatarDataHora, paraIsoData } from "../../utils/datas";

type Dialogo =
  | { tipo: "periodo"; periodo: PeriodoApuracao | null }
  | { tipo: "premios"; periodo: PeriodoApuracao }
  | { tipo: "encerrar"; periodo: PeriodoApuracao }
  | { tipo: "reabrir"; periodo: PeriodoApuracao }
  | { tipo: "excluir"; periodo: PeriodoApuracao }
  | { tipo: "regularizar"; referencia_tipo: "plano" | "acao"; referencia_id: number; rotulo: string }
  | null;

export function PeriodosApuracaoPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const pode = {
    gerenciar: temPermissao(usuario, "gamificacao:periodos"),
    encerrar: temPermissao(usuario, "gamificacao:encerrar"),
    reabrir: temPermissao(usuario, "gamificacao:reabrir"),
    auditoria: temPermissao(usuario, "gamificacao:auditoria"),
  };
  const periodos = usePeriodosApuracao();
  const inconsistencias = useInconsistencias(pode.gerenciar || pode.encerrar || pode.auditoria);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [ano, setAno] = useState(String(new Date().getFullYear()));

  const gerar = useMutacaoGamificacao((a: number) => api.gamificacao.periodos.gerarTrimestres(a));
  const recalcular = useMutacaoGamificacao((id: number) => api.gamificacao.periodos.recalcular(id));
  const erroAcao = gerar.error ?? recalcular.error;

  const aoGerar = () =>
    gerar.mutate(Number(ano), {
      onSuccess: (r) =>
        setMensagem(
          [
            r.criados.length ? `Criados: ${r.criados.join("; ")}.` : "Nenhum período novo.",
            r.existentes.length ? `${r.existentes.length} já existia(m).` : "",
            r.conflitos.length ? `Não criados (sobreposição): ${r.conflitos.join(" ")}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        ),
    });

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Períodos e prêmios da apuração</h1>
          <p className={styles.subtitulo}>
            Cada período apura as conclusões efetivas entre a data inicial (00:00) e a final (23:59), no horário de Brasília. Períodos não se
            sobrepõem.
          </p>
        </div>
        <div className={styles.filtros}>
          <ButtonLink to="/gamificacao">Voltar ao ranking</ButtonLink>
          {pode.gerenciar && (
            <>
              <label className={styles.campo}>
                <span className={styles.rotulo}>Ano</span>
                <Input compacto type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} className={local.ano} />
              </label>
              <Button onClick={aoGerar} disabled={gerar.isPending || !/^\d{4}$/.test(ano)}>
                Gerar trimestres
              </Button>
              <Button variante="primaria" onClick={() => setDialogo({ tipo: "periodo", periodo: null })}>
                Novo período
              </Button>
            </>
          )}
        </div>
      </header>

      {mensagem && (
        <p className={styles.nota} role="status">
          {mensagem}
        </p>
      )}
      {erroAcao && (
        <p className={styles.erro} role="alert">
          {erroAcao.message}
        </p>
      )}

      <Card aria-labelledby="titulo-periodos">
        <h2 id="titulo-periodos" className={styles.secaoTitulo}>Períodos</h2>
        {periodos.error ? (
          <p className={styles.erro}>Não foi possível carregar os períodos: {periodos.error.message}</p>
        ) : !periodos.data ? (
          <p className={styles.vazio}>Carregando…</p>
        ) : !periodos.data.items.length ? (
          <p className={styles.vazio}>
            <strong>Nenhum período cadastrado</strong>
            Gere os trimestres do ano ou cadastre um período.
          </p>
        ) : (
          <Table className={styles.ranking}>
            <thead>
              <tr>
                <th scope="col">Período</th>
                <th scope="col">Datas</th>
                <th scope="col">Situação</th>
                <th scope="col">Prêmios</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {periodos.data.items.map((p) => {
                const encerrado = p.situacao === "encerrado";
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nome}</strong>
                      {p.encerrado_em && <span className={styles.meta}>Encerrado em {formatarDataHora(p.encerrado_em)}</span>}
                    </td>
                    <td>
                      {formatarData(p.data_inicio)} a {formatarData(p.data_fim)}
                    </td>
                    <td>
                      <Badge tom={TOM_SITUACAO[p.situacao]}>{ROTULO_SITUACAO[p.situacao]}</Badge>
                    </td>
                    <td>
                      {p.premios.length ? (
                        <ul className={local.listaPremios}>
                          {p.premios.map((x) => (
                            <li key={`${x.categoria}-${x.colocacao}`}>
                              {ROTULO_CATEGORIA[x.categoria]} {x.colocacao}º: {textoPremio(x)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className={styles.meta}>Nenhum</span>
                      )}
                    </td>
                    <td>
                      <div className={local.acoes}>
                        <ButtonLink tamanho="sm" to={`/gamificacao?periodo_id=${p.id}`}>
                          Ranking
                        </ButtonLink>
                        {pode.gerenciar && !encerrado && (
                          <>
                            <Button tamanho="sm" onClick={() => setDialogo({ tipo: "periodo", periodo: p })}>
                              Editar
                            </Button>
                            <Button tamanho="sm" onClick={() => setDialogo({ tipo: "premios", periodo: p })}>
                              Prêmios
                            </Button>
                            <Button
                              tamanho="sm"
                              disabled={recalcular.isPending}
                              onClick={() =>
                                recalcular.mutate(p.id, {
                                  onSuccess: (r) => setMensagem(`Recálculo de “${p.nome}”: ${r.criados} lançamento(s) criado(s), ${r.revertidos} revertido(s).`),
                                })
                              }
                            >
                              Recalcular
                            </Button>
                          </>
                        )}
                        {pode.encerrar && p.situacao === "aberto" && (
                          <Button tamanho="sm" variante="primaria" onClick={() => setDialogo({ tipo: "encerrar", periodo: p })}>
                            Encerrar…
                          </Button>
                        )}
                        {pode.reabrir && encerrado && (
                          <Button tamanho="sm" onClick={() => setDialogo({ tipo: "reabrir", periodo: p })}>
                            Reabrir…
                          </Button>
                        )}
                        {pode.gerenciar && !encerrado && (
                          <Button tamanho="sm" variante="perigo" onClick={() => setDialogo({ tipo: "excluir", periodo: p })}>
                            Excluir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {(pode.gerenciar || pode.encerrar || pode.auditoria) && (
        <Card aria-labelledby="titulo-inconsistencias">
          <h2 id="titulo-inconsistencias" className={styles.secaoTitulo}>Registros para regularização</h2>
          <p className={styles.nota}>
            Planos e ações concluídos sem data de conclusão não pontuam e impedem o encerramento: não dá para saber a que período pertencem. O
            sistema não inventa datas; informe a data efetiva com uma justificativa.
          </p>
          {inconsistencias.error ? (
            <p className={styles.erro}>Não foi possível carregar: {inconsistencias.error.message}</p>
          ) : !inconsistencias.data ? (
            <p className={styles.vazio}>Carregando…</p>
          ) : !inconsistencias.data.length ? (
            <p className={styles.vazio}>Nenhum registro pendente.</p>
          ) : (
            <Table className={styles.ranking}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Prazo</th>
                  <th scope="col">Problema</th>
                  {pode.gerenciar && <th scope="col">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {inconsistencias.data.map((i) => (
                  <tr key={`${i.referencia_tipo}-${i.referencia_id}`}>
                    <td>{i.rotulo}</td>
                    <td>{i.responsavel}</td>
                    <td>{i.prazo ? formatarData(i.prazo) : "—"}</td>
                    <td>{i.problema}</td>
                    {pode.gerenciar && (
                      <td>
                        <Button
                          tamanho="sm"
                          onClick={() => setDialogo({ tipo: "regularizar", referencia_tipo: i.referencia_tipo, referencia_id: i.referencia_id, rotulo: i.rotulo })}
                        >
                          Regularizar…
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {dialogo?.tipo === "periodo" && <FormPeriodo periodo={dialogo.periodo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
      {dialogo?.tipo === "premios" && <FormPremios periodo={dialogo.periodo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
      {dialogo?.tipo === "encerrar" && <Encerrar periodo={dialogo.periodo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
      {dialogo?.tipo === "reabrir" && <Reabrir periodo={dialogo.periodo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
      {dialogo?.tipo === "excluir" && <Excluir periodo={dialogo.periodo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
      {dialogo?.tipo === "regularizar" && <Regularizar {...dialogo} onFechar={() => setDialogo(null)} onSalvo={setMensagem} />}
    </div>
  );
}

interface DialogoProps {
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
}

function Erro({ erro }: { erro: Error | null }) {
  return erro ? (
    <p className={styles.erro} role="alert">
      {erro.message}
    </p>
  ) : null;
}

function FormPeriodo({ periodo, onFechar, onSalvo }: DialogoProps & { periodo: PeriodoApuracao | null }) {
  const [nome, setNome] = useState(periodo?.nome ?? "");
  const [inicio, setInicio] = useState(periodo?.data_inicio ?? "");
  const [fim, setFim] = useState(periodo?.data_fim ?? "");
  const [situacao, setSituacao] = useState<"planejado" | "aberto">(periodo?.situacao === "aberto" ? "aberto" : "planejado");
  const salvar = useMutacaoGamificacao(() => {
    const corpo = { nome: nome.trim(), ano: Number(inicio.slice(0, 4)), data_inicio: inicio, data_fim: fim, situacao };
    return periodo ? api.gamificacao.periodos.atualizar(periodo.id, corpo) : api.gamificacao.periodos.criar(corpo);
  });
  const valido = nome.trim().length >= 2 && inicio && fim && inicio <= fim;

  return (
    <Modal
      aberto
      titulo={periodo ? `Editar “${periodo.nome}”` : "Novo período de apuração"}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={!valido || salvar.isPending}
            onClick={() => salvar.mutate(undefined, { onSuccess: (p) => (onSalvo(`Período “${p.nome}” salvo.`), onFechar()) })}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className={local.form}>
        <Field id="per-nome" rotulo="Nome do período" obrigatorio>
          <Input id="per-nome" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 1º trimestre 2027 (Jan–Mar)" />
        </Field>
        <Field id="per-inicio" rotulo="Data inicial" obrigatorio>
          <Input id="per-inicio" type="date" value={inicio} max={fim || undefined} onChange={(e) => setInicio(e.target.value)} />
        </Field>
        <Field id="per-fim" rotulo="Data final" obrigatorio erro={inicio && fim && inicio > fim ? "A data final deve ser igual ou posterior à inicial." : undefined}>
          <Input id="per-fim" type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} />
        </Field>
        <Field id="per-situacao" rotulo="Situação" ajuda="Encerrado só pela ação “Encerrar”.">
          <Select id="per-situacao" value={situacao} onChange={(e) => setSituacao(e.target.value as "planejado" | "aberto")}>
            <option value="planejado">Planejado</option>
            <option value="aberto">Aberto</option>
          </Select>
        </Field>
        <p className={styles.meta}>Ano do período: {inicio ? inicio.slice(0, 4) : "—"} (o da data inicial).</p>
      </div>
      <Erro erro={salvar.error} />
    </Modal>
  );
}

type LinhaPremio = { categoria: CategoriaPontuacao; colocacao: string; nome: string; descricao: string; valor: string };

function FormPremios({ periodo, onFechar, onSalvo }: DialogoProps & { periodo: PeriodoApuracao }) {
  const [linhas, setLinhas] = useState<LinhaPremio[]>(
    periodo.premios.map((p) => ({
      categoria: p.categoria, colocacao: String(p.colocacao), nome: p.nome, descricao: p.descricao ?? "", valor: p.valor ? String(p.valor) : "",
    })),
  );
  const mudar = (i: number, parcial: Partial<LinhaPremio>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...parcial } : l)));
  const chaves = linhas.map((l) => `${l.categoria}-${l.colocacao}`);
  const repetidas = new Set(chaves.filter((c, i) => chaves.indexOf(c) !== i));
  const invalida = linhas.some((l) => !l.nome.trim() || !(Number(l.colocacao) >= 1) || (l.valor !== "" && !(Number(l.valor.replace(",", ".")) >= 0)));
  const salvar = useMutacaoGamificacao(() =>
    api.gamificacao.periodos.definirPremios(
      periodo.id,
      linhas.map(
        (l): PremioEntrada => ({
          categoria: l.categoria, colocacao: Number(l.colocacao), nome: l.nome.trim(), descricao: l.descricao.trim() || null,
          valor: l.valor === "" ? null : l.valor.replace(",", "."),
        }),
      ),
    ),
  );
  const proxima = (categoria: CategoriaPontuacao) => String(Math.max(0, ...linhas.filter((l) => l.categoria === categoria).map((l) => Number(l.colocacao) || 0)) + 1);

  return (
    <Modal
      aberto
      titulo={`Prêmios — ${periodo.nome}`}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={salvar.isPending || invalida || repetidas.size > 0}
            onClick={() => salvar.mutate(undefined, { onSuccess: () => (onSalvo(`Prêmios de “${periodo.nome}” salvos.`), onFechar()) })}
          >
            Salvar prêmios
          </Button>
        </>
      }
    >
      <p className={styles.nota}>Quantos premiados e quais valores ficam a seu critério. Uma colocação por categoria.</p>
      <div className={local.premios}>
        {linhas.map((l, i) => {
          const repetida = repetidas.has(`${l.categoria}-${l.colocacao}`);
          return (
            <fieldset key={i} className={local.linhaPremio}>
              <legend className={styles.meta}>Prêmio {i + 1}</legend>
              <Field id={`pr-cat-${i}`} rotulo="Categoria">
                <Select id={`pr-cat-${i}`} compacto value={l.categoria} onChange={(e) => mudar(i, { categoria: e.target.value as CategoriaPontuacao })}>
                  <option value="executor">Executor</option>
                  <option value="gestor">Gestor</option>
                </Select>
              </Field>
              <Field id={`pr-col-${i}`} rotulo="Colocação" erro={repetida ? "Repetida" : undefined}>
                <Input id={`pr-col-${i}`} compacto type="number" min={1} value={l.colocacao} onChange={(e) => mudar(i, { colocacao: e.target.value })} className={local.ano} />
              </Field>
              <Field id={`pr-nome-${i}`} rotulo="Nome do prêmio" obrigatorio>
                <Input id={`pr-nome-${i}`} compacto maxLength={100} value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} />
              </Field>
              <Field id={`pr-valor-${i}`} rotulo="Valor (R$)" ajuda="Opcional">
                <Input id={`pr-valor-${i}`} compacto inputMode="decimal" value={l.valor} onChange={(e) => mudar(i, { valor: e.target.value })} className={local.valor} />
              </Field>
              <Field id={`pr-desc-${i}`} rotulo="Descrição" className={local.largo}>
                <Input id={`pr-desc-${i}`} compacto maxLength={500} value={l.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} />
              </Field>
              <Button tamanho="sm" variante="perigo" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </fieldset>
          );
        })}
      </div>
      <div className={local.acoes}>
        {(["executor", "gestor"] as const).map((c) => (
          <Button key={c} tamanho="sm" onClick={() => setLinhas((ls) => [...ls, { categoria: c, colocacao: proxima(c), nome: "", descricao: "", valor: "" }])}>
            + Prêmio de {ROTULO_CATEGORIA[c].toLowerCase()}
          </Button>
        ))}
      </div>
      <Erro erro={salvar.error} />
    </Modal>
  );
}

function Encerrar({ periodo, onFechar, onSalvo }: DialogoProps & { periodo: PeriodoApuracao }) {
  const verificacao = useVerificacaoEncerramento(periodo.id);
  const encerrar = useMutacaoGamificacao(() => api.gamificacao.periodos.encerrar(periodo.id));
  const v = verificacao.data;

  return (
    <Modal
      aberto
      titulo={`Encerrar “${periodo.nome}”`}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={!v?.pode_encerrar || encerrar.isPending}
            onClick={() => encerrar.mutate(undefined, { onSuccess: () => (onSalvo(`Apuração de “${periodo.nome}” encerrada.`), onFechar()) })}
          >
            Encerrar definitivamente
          </Button>
        </>
      }
    >
      <p className={styles.nota}>
        O encerramento guarda uma fotografia dos resultados, das regras e dos prêmios. Depois dele, mudanças em planos, ações ou cadastros não
        alteram este período (só reabrindo, com justificativa).
      </p>
      {verificacao.error ? (
        <Erro erro={verificacao.error} />
      ) : !v ? (
        <p className={styles.vazio}>Verificando…</p>
      ) : (
        <>
          {v.bloqueios.length ? (
            <>
              <p className={styles.erro}>
                <strong>O período não pode ser encerrado agora:</strong>
              </p>
              <ul className={local.lista}>
                {v.bloqueios.map((b, i) => (
                  <li key={i}>{b.mensagem}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.nota}>
              <strong>Tudo certo para encerrar.</strong>
            </p>
          )}
          {v.avisos.length > 0 && (
            <>
              <p className={styles.nota}>Itens alterados depois da pontuação (os pontos registrados valem; corrija pela auditoria se preciso):</p>
              <ul className={local.lista}>
                {v.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Erro erro={encerrar.error} />
    </Modal>
  );
}

function Justificativa({ id, valor, onMudar }: { id: string; valor: string; onMudar: (v: string) => void }) {
  return (
    <Field id={id} rotulo="Justificativa" obrigatorio ajuda="Pelo menos 10 caracteres. Fica registrada na auditoria.">
      <Textarea id={id} value={valor} maxLength={500} rows={3} onChange={(e) => onMudar(e.target.value)} />
    </Field>
  );
}

function Reabrir({ periodo, onFechar, onSalvo }: DialogoProps & { periodo: PeriodoApuracao }) {
  const [justificativa, setJustificativa] = useState("");
  const reabrir = useMutacaoGamificacao(() => api.gamificacao.periodos.reabrir(periodo.id, justificativa.trim()));
  return (
    <Modal
      aberto
      titulo={`Reabrir “${periodo.nome}”`}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={justificativa.trim().length < 10 || reabrir.isPending}
            onClick={() => reabrir.mutate(undefined, { onSuccess: () => (onSalvo(`Apuração de “${periodo.nome}” reaberta.`), onFechar()) })}
          >
            Reabrir apuração
          </Button>
        </>
      }
    >
      <p className={styles.nota}>O resultado encerrado continua guardado no histórico. Reaberto, o período volta a refletir o extrato atual.</p>
      <Justificativa id="reabrir-just" valor={justificativa} onMudar={setJustificativa} />
      <Erro erro={reabrir.error} />
    </Modal>
  );
}

function Excluir({ periodo, onFechar, onSalvo }: DialogoProps & { periodo: PeriodoApuracao }) {
  const excluir = useMutacaoGamificacao(() => api.gamificacao.periodos.excluir(periodo.id));
  return (
    <Modal
      aberto
      titulo={`Excluir “${periodo.nome}”?`}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="perigo"
            disabled={excluir.isPending}
            onClick={() => excluir.mutate(undefined, { onSuccess: () => (onSalvo(`Período “${periodo.nome}” excluído.`), onFechar()) })}
          >
            Excluir
          </Button>
        </>
      }
    >
      <p className={styles.nota}>Os pontos não são apagados (eles pertencem às datas de conclusão). Só o período e seus prêmios deixam de existir.</p>
      <Erro erro={excluir.error} />
    </Modal>
  );
}

function Regularizar({
  referencia_tipo, referencia_id, rotulo, onFechar, onSalvo,
}: DialogoProps & { referencia_tipo: "plano" | "acao"; referencia_id: number; rotulo: string }) {
  const [data, setData] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const hoje = paraIsoData(new Date());
  const salvar = useMutacaoGamificacao(() =>
    api.gamificacao.regularizar({ referencia_tipo, referencia_id, data_conclusao: data, justificativa: justificativa.trim() }),
  );
  return (
    <Modal
      aberto
      titulo="Regularizar data de conclusão"
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            variante="primaria"
            disabled={!data || justificativa.trim().length < 10 || salvar.isPending}
            onClick={() => salvar.mutate(undefined, { onSuccess: () => (onSalvo(`${rotulo}: data de conclusão registrada.`), onFechar()) })}
          >
            Registrar
          </Button>
        </>
      }
    >
      <p className={styles.nota}>{rotulo}</p>
      <Field id="reg-data" rotulo="Data efetiva da conclusão" obrigatorio ajuda="Confirme a data em um registro (ata, e-mail, sistema).">
        <Input id="reg-data" type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
      </Field>
      <Justificativa id="reg-just" valor={justificativa} onMudar={setJustificativa} />
      <Erro erro={salvar.error} />
    </Modal>
  );
}
