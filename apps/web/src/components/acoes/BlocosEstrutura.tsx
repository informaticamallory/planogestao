/**
 * Estrutura da ação: pré-requisitos ("Depende da conclusão de"), planejamento (área, setor,
 * prazo inicial estimado) e subações. As regras valem no backend; aqui só se mostra e se envia.
 */
import type { AcaoDetalhe, AcaoDoPlano, AcaoAtualizar, RefAcao } from "@planogestao/shared-types";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAtualizarAcao, useCriarSubacoes, useReabrirAcao } from "../../hooks/useAcao";
import { useAcoesDoPlano } from "../../hooks/usePlano";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { formatarData } from "../../utils/datas";
import { ROTULO_STATUS_ACAO } from "../../utils/rotulos";
import { useAjustePrazoDependencia } from "../planos/novo/AjustePrazoDependencia";
import { EtapaAcoes } from "../planos/novo/EtapaAcoes";
import { acoesParaApi, novaAcao, validarListaAcoes, type AcaoForm } from "../planos/novo/formularioPlano";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Field, fieldAria } from "../ui/Field";
import { Checkbox, Input, Textarea } from "../ui/Input";
import { ProgressBar } from "../ui/ProgressBar";
import { Select } from "../ui/Select";
import { ActionStatusBadge } from "../ui/StatusBadges";
import styles from "./Acao.module.css";

const ABERTOS = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada"];

const rotuloRef = (r: RefAcao) => `${r.numero.includes(".") ? "Sub-item" : "Ação"} ${r.numero} — ${r.descricao}`;

/** Gestor reabre uma ação concluída (com justificativa). O status do plano é recalculado. */
export function BlocoReabrir({ acao }: { acao: AcaoDetalhe }) {
  const [aberto, setAberto] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const reabrir = useReabrirAcao(acao.id);
  const valida = justificativa.trim().length >= 5;

  if (!aberto) {
    return (
      <div className={styles.faixaInfo}>
        Ação concluída.{" "}
        <Button variante="link" onClick={() => setAberto(true)}>
          Reabrir ação
        </Button>
      </div>
    );
  }
  return (
    <section className={styles.bloco} aria-labelledby="titulo-reabrir">
      <h2 id="titulo-reabrir" className={styles.tituloBloco}>
        Reabrir ação
      </h2>
      <p className={styles.textoApoio}>
        A ação volta para “Em andamento” e o plano é recalculado (um plano concluído volta a “Em andamento”). A conclusão anterior
        continua no histórico; ações que dependem desta e já começaram ficam sinalizadas para revisão.
      </p>
      <Field id="reabrir-justificativa" rotulo="Justificativa" obrigatorio>
        <Textarea
          {...fieldAria("reabrir-justificativa")}
          rows={2}
          maxLength={500}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
        />
      </Field>
      {reabrir.isError && (
        <p className={styles.erro} role="alert">
          {reabrir.error.message}
        </p>
      )}
      <div className={styles.botoes}>
        <Button onClick={() => setAberto(false)} disabled={reabrir.isPending}>
          Cancelar
        </Button>
        <Button
          variante="primaria"
          disabled={!valida || reabrir.isPending}
          onClick={() => reabrir.mutate(justificativa.trim(), { onSuccess: () => setAberto(false) })}
        >
          {reabrir.isPending ? "Reabrindo…" : "Reabrir"}
        </Button>
      </div>
    </section>
  );
}

/** "Aguardando ação anterior": quais pré-requisitos impedem o início. Já iniciada: "revisar". */
export function FaixaAguardando({ acao }: { acao: AcaoDetalhe }) {
  if (acao.aguardando.length === 0 || !ABERTOS.includes(acao.status)) return null;
  if (acao.revisar_prerequisito) {
    return (
      <div className={styles.faixaAguardando} role="status">
        <strong>Revisar: pré-requisito reaberto.</strong> Esta ação já foi iniciada, mas depende de:
        <ul>
          {acao.aguardando.map((p) => (
            <li key={p.id}>
              {rotuloRef(p)} <span className={styles.textoApoio}>({ROTULO_STATUS_ACAO[p.status]})</span>
            </li>
          ))}
        </ul>
        <span className={styles.textoApoio}>O andamento foi preservado; confira se o trabalho feito continua válido.</span>
      </div>
    );
  }
  return (
    <div className={styles.faixaAguardando} role="status">
      <strong>Aguardando ação anterior.</strong>{" "}
      {acao.acao_origem ? "A ação principal só pode iniciar" : "Esta ação só pode iniciar"} depois da conclusão de:
      <ul>
        {acao.aguardando.map((p) => (
          <li key={p.id}>
            {rotuloRef(p)} <span className={styles.textoApoio}>({ROTULO_STATUS_ACAO[p.status]})</span>
          </li>
        ))}
      </ul>
      <span className={styles.textoApoio}>Enquanto isso, ela pode ser aceita e editada. Concluídos os pré-requisitos, o início é liberado (não é automático).</span>
    </div>
  );
}

// ---- planejamento --------------------------------------------------------------------------

interface Rascunho {
  area_id: string;
  setor_id: string;
  prazo_inicio: string;
  depende_de: number[];
}

const doDetalhe = (a: AcaoDetalhe): Rascunho => ({
  area_id: String(a.area.id),
  setor_id: a.setor ? String(a.setor.id) : "",
  prazo_inicio: a.prazo_inicio ?? "",
  depende_de: a.depende_de.map((p) => p.id),
});

/** A ação `id` depende (direta ou indiretamente) de `alvo`? (para não oferecer ciclos) */
function dependeDe(acoes: AcaoDoPlano[], id: number, alvo: number, vistos = new Set<number>()): boolean {
  const a = acoes.find((x) => x.id === id);
  if (!a || vistos.has(id)) return false;
  vistos.add(id);
  return a.depende_de.some((p) => p.id === alvo || dependeDe(acoes, p.id, alvo, vistos));
}

/** Ids das subações abaixo de `id` (todos os níveis), pela lista do plano (vínculo pelo id do pai). */
export function descendentesDe(acoes: AcaoDoPlano[], id: number): Set<number> {
  const filhos = new Map<number, number[]>();
  for (const a of acoes) if (a.acao_pai_id !== null) filhos.set(a.acao_pai_id, [...(filhos.get(a.acao_pai_id) ?? []), a.id]);
  const resultado = new Set<number>();
  const pilha = [...(filhos.get(id) ?? [])];
  while (pilha.length) {
    const atual = pilha.pop()!;
    if (resultado.has(atual)) continue;
    resultado.add(atual);
    pilha.push(...(filhos.get(atual) ?? []));
  }
  return resultado;
}

export function BlocoPlanejamento({ acao }: { acao: AcaoDetalhe }) {
  const pode = acao.permissoes.editar_planejamento;
  const [editando, setEditando] = useState(false);
  const [r, setR] = useState<Rascunho>(() => doDetalhe(acao));
  const [avisos, setAvisos] = useState<string[]>([]);
  const opcoes = useOpcoesPlanos().data;
  const atualizar = useAtualizarAcao(acao.id);
  const principal = !acao.acao_origem;
  const doPlano = useAcoesDoPlano(acao.plano.id, editando && acao.plano_visivel).data ?? [];
  // Qualquer item do plano, fora o próprio, os de cima (caminho) e os de baixo (travariam a conclusão).
  const linhagem = new Set([acao.id, ...acao.caminho.map((c) => c.id), ...descendentesDe(doPlano, acao.id)]);
  const candidatas = doPlano.filter((a) => !linhagem.has(a.id) && a.status !== "cancelada" && a.status !== "recusada");
  const ajuste = useAjustePrazoDependencia();

  /** Marcar pergunta pelo ajuste do prazo inicial (mesma regra do formulário de criação); desmarcar não. */
  const alternarDependencia = (c: AcaoDoPlano, marcada: boolean) => {
    if (marcada) return setR({ ...r, depende_de: r.depende_de.filter((x) => x !== c.id) });
    const depende_de = [...r.depende_de, c.id];
    ajuste.perguntar({
      item: `${principal ? "Ação" : "Sub-item"} ${acao.numero}`,
      prazoInicio: r.prazo_inicio,
      prazo: acao.prazo,
      // A lista do plano traz todos os itens (inclusive os já vinculados), com o prazo de conclusão.
      preRequisitos: depende_de.map((id) => {
        const p = doPlano.find((x) => x.id === id);
        return { rotulo: p ? `${p.acao_pai_id ? "Sub-item" : "Ação"} ${p.numero}` : "?", descricao: p?.descricao ?? "", prazo: p?.prazo ?? null };
      }),
      marcar: (novoInicio) => setR({ ...r, depende_de, prazo_inicio: novoInicio ?? r.prazo_inicio }),
    });
  };

  const iniciar = () => {
    setR(doDetalhe(acao));
    setAvisos([]);
    setEditando(true);
  };

  const alteracoes: AcaoAtualizar = {};
  if (r.prazo_inicio && r.prazo_inicio !== (acao.prazo_inicio ?? "")) alteracoes.prazo_inicio = r.prazo_inicio;
  if (r.area_id !== String(acao.area.id)) alteracoes.area_id = Number(r.area_id);
  if (r.setor_id !== (acao.setor ? String(acao.setor.id) : "")) alteracoes.setor_id = r.setor_id ? Number(r.setor_id) : null;
  const atuais = acao.depende_de.map((p) => p.id).sort().join(",");
  if ([...r.depende_de].sort().join(",") !== atuais) alteracoes.depende_de = r.depende_de;
  const erroData = r.prazo_inicio && r.prazo_inicio > acao.prazo ? "O prazo inicial estimado não pode ser posterior ao prazo de conclusão." : null;

  const salvar = () =>
    atualizar.mutate(alteracoes, {
      onSuccess: (res) => {
        setAvisos(res.avisos);
        setEditando(false);
      },
    });

  const setores = (opcoes?.setores ?? []).filter((s) => String(s.area_id) === r.area_id);

  return (
    <section className={styles.bloco} aria-labelledby="titulo-planejamento">
      <h2 id="titulo-planejamento" className={styles.tituloBloco}>
        Planejamento
      </h2>

      {!editando ? (
        <>
          <dl className={styles.listaDatas}>
            <dt>Área / Setor</dt>
            <dd>
              {acao.area.nome}
              {acao.setor && ` / ${acao.setor.nome}`}
            </dd>
            <dt>Prazo inicial estimado</dt>
            <dd>{acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "Não informado"}</dd>
            <dt>Prazo de conclusão (estimado)</dt>
            <dd>{formatarData(acao.prazo)}</dd>
            <dt>Depende da conclusão de</dt>
            <dd>
              {acao.depende_de.length === 0 ? (
                principal ? "Nenhuma ação" : "Nenhuma (segue também os pré-requisitos dos itens acima)"
              ) : (
                <ul className={styles.listaRefs}>
                  {acao.depende_de.map((p) => (
                    <li key={p.id}>
                      {acao.plano_visivel ? <Link to={`/acoes/${p.id}`}>{rotuloRef(p)}</Link> : rotuloRef(p)}{" "}
                      <span className={styles.textoApoio}>({ROTULO_STATUS_ACAO[p.status]})</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
          {avisos.length > 0 && (
            <ul className={styles.avisos} role="status">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {pode && (
            <Button variante="link" className={styles.link} onClick={iniciar}>
              Editar planejamento
            </Button>
          )}
        </>
      ) : (
        <div className={styles.formSolicitacao}>
          <Field id="plan-area" rotulo="Área" obrigatorio>
            <Select id="plan-area" value={r.area_id} onChange={(e) => setR({ ...r, area_id: e.target.value, setor_id: "" })}>
              {opcoes?.areas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="plan-setor" rotulo="Setor">
            <Select id="plan-setor" value={r.setor_id} onChange={(e) => setR({ ...r, setor_id: e.target.value })}>
              <option value="">Nenhum</option>
              {setores.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="plan-inicio" rotulo="Prazo inicial estimado" erro={erroData ?? undefined}>
            <Input
              {...fieldAria("plan-inicio", erroData ?? undefined)}
              type="date"
              value={r.prazo_inicio}
              max={acao.prazo}
              onChange={(e) => setR({ ...r, prazo_inicio: e.target.value })}
            />
          </Field>
          {acao.plano_visivel && (
            <fieldset className={styles.grupoRefs}>
              <legend>Depende da conclusão de</legend>
              {candidatas.length === 0 && <p className={styles.textoApoio}>Nenhuma outra ação disponível.</p>}
              {candidatas.map((c) => {
                const marcada = r.depende_de.includes(c.id);
                const ciclo = dependeDe(doPlano, c.id, acao.id);
                return (
                  <Checkbox
                    key={c.id}
                    rotulo={`${c.acao_pai_id ? "Sub-item" : "Ação"} ${c.numero} — ${c.descricao} (${ROTULO_STATUS_ACAO[c.status]})${ciclo && !marcada ? " — já depende desta" : ""}`}
                    checked={marcada}
                    disabled={ciclo && !marcada}
                    onChange={() => alternarDependencia(c, marcada)}
                  />
                );
              })}
            </fieldset>
          )}
          {atualizar.isError && (
            <p className={styles.erro} role="alert">
              {atualizar.error.message}
            </p>
          )}
          <div className={styles.botoes}>
            <Button onClick={() => setEditando(false)} disabled={atualizar.isPending}>
              Cancelar
            </Button>
            <Button
              variante="primaria"
              onClick={salvar}
              disabled={atualizar.isPending || !!erroData || Object.keys(alteracoes).length === 0}
            >
              {atualizar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
          {ajuste.modal}
        </div>
      )}
    </section>
  );
}


// ---- subações --------------------------------------------------------------------------------

/**
 * "Adicionar subação": o MESMO formulário das ações (cartões que contraem, mesmos campos e validações),
 * num painel lateral. O vínculo com o pai é automático; área/setor vêm sugeridos do pai (editáveis).
 */
function DrawerNovasSubacoes({ acao, onFechar }: { acao: AcaoDetalhe; onFechar: () => void }) {
  const doPlano = useAcoesDoPlano(acao.plano.id, acao.plano_visivel).data ?? [];
  const [itens, setItens] = useState<AcaoForm[]>(() => [
    { ...novaAcao(acao.prioridade), area_id: String(acao.area.id), setor_id: acao.setor ? String(acao.setor.id) : "" },
  ]);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const criar = useCriarSubacoes(acao.id);
  const erros = mostrarErros ? validarListaAcoes(itens) : {};

  const salvar = () => {
    setMostrarErros(true);
    if (itens.length === 0 || Object.keys(validarListaAcoes(itens)).length) return;
    criar.mutate(acoesParaApi(itens), { onSuccess: (r) => (r.avisos.length ? setAvisos(r.avisos) : onFechar()) });
  };

  return (
    <Drawer
      aberto
      titulo={`Adicionar sub-item em ${acao.acao_origem ? "Sub-item" : "Ação"} ${acao.numero}`}
      onFechar={onFechar}
      rodape={
        avisos.length ? (
          <Button variante="primaria" onClick={onFechar}>
            Fechar
          </Button>
        ) : (
          <>
            {criar.isError && <span className={styles.erro}>{criar.error.message}</span>}
            <Button onClick={onFechar}>Cancelar</Button>
            <Button variante="primaria" onClick={salvar} disabled={criar.isPending || itens.length === 0}>
              {criar.isPending ? "Salvando…" : `Salvar ${itens.length} sub-item(ns)`}
            </Button>
          </>
        )
      }
    >
      {avisos.length ? (
        <div role="status">
          <p>Sub-itens criados, com avisos:</p>
          <ul>
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : (
        <EtapaAcoes
          acoes={itens}
          onAlterar={setItens}
          fimEstimado={acao.plano.data_fim_estimado}
          prioridadePadrao={acao.prioridade}
          erros={erros}
          acoesExistentes={doPlano}
          pai={{
            id: acao.id,
            numero: acao.numero,
            subacoesDiretas: acao.subacoes.length,
            // A própria linhagem (o pai e os de cima) não pode ser pré-requisito.
            bloqueados: [acao.id, ...acao.caminho.map((c) => c.id)],
          }}
        />
      )}
    </Drawer>
  );
}

/** Subações diretas do item (cada uma com a contagem das suas); o responsável de cima acompanha as de baixo. */
export function BlocoSubacoes({ acao }: { acao: AcaoDetalhe }) {
  const [criando, setCriando] = useState(false);
  const pode = acao.permissoes.adicionar_subacao;
  if (acao.subacoes.length === 0 && !pode) return null;

  return (
    <section className={styles.bloco} aria-labelledby="titulo-subacoes">
      <div className={styles.cabecalhoBloco}>
        <h2 id="titulo-subacoes" className={styles.tituloBloco}>
          Sub-itens{" "}
          {acao.subacoes.length > 0 && (
            <span className={styles.textoApoio}>
              ({acao.subacoes.length} direta{acao.subacoes.length === 1 ? "" : "s"} · {acao.total_descendentes} no total)
            </span>
          )}
        </h2>
        {pode && (
          <Button variante="primaria" onClick={() => setCriando(true)}>
            + Adicionar sub-item
          </Button>
        )}
      </div>
      {acao.subacoes_pendentes > 0 && (
        <p className={styles.textoApoio}>
          {acao.subacoes_pendentes} sub-item(ns) em aberto: este item só pode ser concluído depois que eles (e os que estão abaixo
          deles) forem concluídos ou cancelados.
        </p>
      )}
      {acao.subacoes.length === 0 && <p className={styles.textoApoio}>Nenhum sub-item.</p>}
      {acao.subacoes.length > 0 && (
        <ul className={styles.listaSubacoes}>
          {acao.subacoes.map((s) => (
            <li key={s.id} className={styles.subacao}>
              <div className={styles.linhaSubacao}>
                <Link to={`/acoes/${s.id}`} className={styles.tituloSubacao}>
                  Sub-item {s.numero} — {s.descricao}
                </Link>
                <ActionStatusBadge status={s.status} prazoTag={s.prazo_tag} />
              </div>
              <span className={styles.textoApoio}>
                {s.responsavel.nome} · {s.area.nome}
                {s.setor && ` / ${s.setor.nome}`} · {s.prazo_inicio ? formatarData(s.prazo_inicio) : "?"} → {formatarData(s.prazo)}
                {s.total_descendentes > 0 && ` · ${s.subacoes_diretas} direta(s), ${s.total_descendentes} abaixo`}
              </span>
              <ProgressBar valor={s.progresso} rotulo={`Progresso do sub-item ${s.numero}`} />
            </li>
          ))}
        </ul>
      )}
      {criando && <DrawerNovasSubacoes acao={acao} onFechar={() => setCriando(false)} />}
    </section>
  );
}
