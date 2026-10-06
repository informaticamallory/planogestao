import type { AcaoDoPlano, Prioridade, StatusInicialAcao } from "@planogestao/shared-types";
import { useState } from "react";

import { useOpcoesPlanos } from "../../../hooks/usePlanos";
import { formatarData } from "../../../utils/datas";
import { ROTULO_PRIORIDADE, ROTULO_STATUS_ACAO } from "../../../utils/rotulos";
import { Button } from "../../ui/Button";
import { Field, fieldAria } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Checkbox, Input, Textarea } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { UserPicker } from "../../ui/UserPicker";
import type { PreRequisitoPrazo } from "./ajustePrazo";
import { useAjustePrazoDependencia } from "./AjustePrazoDependencia";
import { avisoPrazoAcao, dependeDe, novaAcao, progressoFixo, type AcaoForm, type Erros } from "./formularioPlano";
import styles from "./Etapas.module.css";

const STATUS_INICIAIS: StatusInicialAcao[] = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada", "concluida"];

interface Props {
  acoes: AcaoForm[];
  onAlterar: (acoes: AcaoForm[]) => void;
  /** Para o aviso de prazo da ação posterior ao fim estimado. */
  fimEstimado: string;
  /** Prioridade sugerida para novas ações. */
  prioridadePadrao: Prioridade | "";
  erros: Erros;
  /** Itens já cadastrados no plano (ações e subações): podem ser pré-requisito. */
  acoesExistentes?: AcaoDoPlano[];
  /**
   * Subações: o item pai (vínculo pelo id; número só visual). As novas são numeradas "pai.N" e não podem
   * depender da própria linhagem (`bloqueados` = ids do pai e dos itens acima dele).
   */
  pai?: { id: number; numero: string; subacoesDiretas: number; bloqueados: number[] };
}

const rotuloItem = (numero: string) => `${numero.includes(".") ? "Sub-item" : "Ação"} ${numero}`;

const periodo = (a: AcaoForm) =>
  a.prazo_inicio || a.prazo ? `${a.prazo_inicio ? formatarData(a.prazo_inicio) : "?"} → ${a.prazo ? formatarData(a.prazo) : "?"}` : "Sem prazos";

/**
 * Lista editável de ações (wizard e "Adicionar ações" num plano existente).
 * Cada ação é um cartão que contrai: o cabeçalho resume número, descrição, área/função-cargo, responsável,
 * prazos e status. Ao adicionar uma ação, as outras contraem e a nova abre. Contrair não apaga nada
 * (o estado fica no formulário); cartões com erro ficam abertos para o erro aparecer.
 */
export function EtapaAcoes({ acoes, onAlterar, fimEstimado, prioridadePadrao, erros, acoesExistentes = [], pai }: Props) {
  const opcoes = useOpcoesPlanos().data;
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(acoes.slice(-1).map((a) => a.chave)));

  // Pré-requisitos possíveis: qualquer item do plano ainda "concluível", fora a linhagem do pai.
  const bloqueados = new Set(pai?.bloqueados ?? []);
  const existentes = acoesExistentes.filter((a) => a.status !== "cancelada" && a.status !== "recusada" && !bloqueados.has(a.id));
  const primeiroNumero = pai
    ? pai.subacoesDiretas + 1
    : Math.max(0, ...acoesExistentes.filter((a) => a.acao_pai_id === null).map((a) => Number(a.numero))) + 1;
  const numero = (i: number) => (pai ? `${pai.numero}.${primeiroNumero + i}` : String(primeiroNumero + i));
  const numeroDaChave = (chave: string) => numero(acoes.findIndex((a) => a.chave === chave));

  const mudarAcao = (chave: string, parcial: Partial<AcaoForm>) =>
    onAlterar(acoes.map((a) => (a.chave === chave ? { ...a, ...parcial } : a)));

  // Marcar um pré-requisito pergunta se o prazo inicial estimado vai para o prazo de conclusão dele
  // (o maior, se houver vários). Desmarcar não pergunta nada.
  const ajuste = useAjustePrazoDependencia();
  const preRequisitosDe = (a: AcaoForm): PreRequisitoPrazo[] => [
    ...a.depende_de_ids.map((pid) => {
      const e = acoesExistentes.find((x) => x.id === pid);
      return { rotulo: rotuloItem(e?.numero ?? "?"), descricao: e?.descricao ?? "", prazo: e?.prazo ?? null };
    }),
    ...a.depende_de.map((c) => {
      const outra = acoes.find((x) => x.chave === c);
      return { rotulo: rotuloItem(numeroDaChave(c)), descricao: outra?.descricao ?? "", prazo: outra?.prazo || null };
    }),
  ];
  const alterarDependencias = (acao: AcaoForm, n: string, marcou: boolean, parcial: Pick<AcaoForm, "depende_de" | "depende_de_ids">) => {
    if (!marcou) return mudarAcao(acao.chave, parcial);
    ajuste.perguntar({
      item: rotuloItem(n),
      prazoInicio: acao.prazo_inicio,
      prazo: acao.prazo,
      preRequisitos: preRequisitosDe({ ...acao, ...parcial }),
      marcar: (novoInicio) => mudarAcao(acao.chave, novoInicio ? { ...parcial, prazo_inicio: novoInicio } : parcial),
    });
  };

  const adicionar = () => {
    const nova = novaAcao(prioridadePadrao, acoes.at(-1));
    onAlterar([...acoes, nova]);
    setAbertas(new Set([nova.chave]));
    requestAnimationFrame(() => document.getElementById(`acao-${nova.chave}-descricao`)?.focus());
  };
  const remover = (chave: string) => onAlterar(acoes.filter((a) => a.chave !== chave));
  const alternar = (chave: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (!nova.delete(chave)) nova.add(chave);
      return nova;
    });

  const comErro = (chave: string) => Object.keys(erros).some((k) => k.startsWith(`${chave}.`));
  const nomeArea = (id: string) => opcoes?.areas.find((a) => String(a.id) === id)?.nome;
  const nomeSetor = (id: string) => opcoes?.setores.find((s) => String(s.id) === id)?.nome;

  return (
    <div className={styles.acoes}>
      {erros.acoes && (
        <p className={styles.erroLista} role="alert">
          {erros.acoes}
        </p>
      )}

      {acoes.map((acao, i) => {
        const id = (campo: string) => `acao-${acao.chave}-${campo}`;
        const erro = (campo: string) => erros[`${acao.chave}.${campo}`];
        const fixo = progressoFixo(acao.status);
        const n = numero(i);
        const pendencias = comErro(acao.chave);
        const aberta = abertas.has(acao.chave) || pendencias;
        const setores = (opcoes?.setores ?? []).filter((s) => String(s.area_id) === acao.area_id);
        // Não dá para remover uma ação usada como pré-requisito: primeiro tire o vínculo.
        const dependentes = acoes.filter((a) => a.depende_de.includes(acao.chave));
        const preRequisitos = [
          ...acao.depende_de_ids.map((pid) => rotuloItem(existentes.find((e) => e.id === pid)?.numero ?? "?")),
          ...acao.depende_de.map((c) => rotuloItem(numeroDaChave(c))),
        ];
        const area = nomeArea(acao.area_id);
        const setor = nomeSetor(acao.setor_id);

        return (
          <section key={acao.chave} className={styles.cartaoAcao} aria-label={rotuloItem(n)}>
            <div className={styles.topoAcao}>
              <button
                type="button"
                className={styles.cabecalhoAcao}
                aria-expanded={aberta}
                aria-controls={id("corpo")}
                onClick={() => alternar(acao.chave)}
                title={pendencias ? "Corrija os campos destacados para poder contrair" : aberta ? "Contrair" : "Expandir"}
              >
                <span className={styles.linhaTituloAcao}>
                  <Icon name={aberta ? "chevronDown" : "chevronRight"} size={16} />
                  <span className={styles.numeroAcao}>{rotuloItem(n)}</span>
                  <span className={styles.resumoAcao}>{acao.descricao.trim() || "Sem descrição"}</span>
                </span>
                <span className={styles.metaAcao}>
                  <span>{area ? (setor ? `${area} / ${setor}` : area) : "Sem área"}</span>
                  <span>{acao.responsavel?.nome ?? "Sem responsável"}</span>
                  <span>{periodo(acao)}</span>
                  <span>{ROTULO_STATUS_ACAO[acao.status]}</span>
                  {preRequisitos.length > 0 && <span className={styles.seloDependencia}>Depende de {preRequisitos.join(", ")}</span>}
                  {pendencias && <span className={styles.seloPendencia}>Campos pendentes</span>}
                </span>
              </button>
              <Button
                variante="link"
                className={styles.removerAcao}
                onClick={() => remover(acao.chave)}
                disabled={dependentes.length > 0}
                title={
                  dependentes.length
                    ? `Pré-requisito de ${dependentes.map((d) => rotuloItem(numeroDaChave(d.chave))).join(", ")}: remova o vínculo antes.`
                    : undefined
                }
                aria-label={`Remover ${rotuloItem(n)}`}
              >
                Remover
              </Button>
            </div>
            {dependentes.length > 0 && aberta && (
              <p className={styles.notaAcao}>
                Pré-requisito de {dependentes.map((d) => rotuloItem(numeroDaChave(d.chave))).join(", ")} — para remover esta ação, tire o vínculo
                nelas antes.
              </p>
            )}

            <div id={id("corpo")} className={styles.corpoAcao} hidden={!aberta}>
              <div className={styles.grade}>
                <Field id={id("descricao")} rotulo="O que será feito" obrigatorio erro={erro("descricao")} className={styles.largo}>
                  <Textarea
                    {...fieldAria(id("descricao"), erro("descricao"))}
                    rows={2}
                    maxLength={2000}
                    value={acao.descricao}
                    onChange={(e) => mudarAcao(acao.chave, { descricao: e.target.value })}
                  />
                </Field>

                <Field id={id("responsavel")} rotulo="Responsável" obrigatorio erro={erro("responsavel")}>
                  <UserPicker
                    id={id("responsavel")}
                    ariaLabel={`Responsável — ${rotuloItem(n)}`}
                    valor={acao.responsavel}
                    onSelecionar={(responsavel) => mudarAcao(acao.chave, { responsavel })}
                    invalido={!!erro("responsavel")}
                    idErro={erro("responsavel") ? `${id("responsavel")}-erro` : undefined}
                  />
                </Field>

                <Field id={id("area")} rotulo="Área" obrigatorio erro={erro("area_id")}>
                  <Select
                    {...fieldAria(id("area"), erro("area_id"))}
                    value={acao.area_id}
                    // Trocar de área invalida a função/cargo escolhida.
                    onChange={(e) => mudarAcao(acao.chave, { area_id: e.target.value, setor_id: "" })}
                  >
                    <option value="">Selecione…</option>
                    {opcoes?.areas.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id={id("setor")} rotulo="Função/Cargo" ajuda={acao.area_id ? undefined : "Escolha a área primeiro."}>
                  <Select
                    id={id("setor")}
                    value={acao.setor_id}
                    disabled={!acao.area_id}
                    onChange={(e) => mudarAcao(acao.chave, { setor_id: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {setores.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  id={id("prazo_inicio")}
                  rotulo="Prazo inicial estimado"
                  obrigatorio
                  erro={erro("prazo_inicio")}
                  ajuda="Previsão de início."
                >
                  <Input
                    {...fieldAria(id("prazo_inicio"), erro("prazo_inicio"))}
                    type="date"
                    value={acao.prazo_inicio}
                    max={acao.prazo || undefined}
                    onChange={(e) => mudarAcao(acao.chave, { prazo_inicio: e.target.value })}
                  />
                </Field>

                <Field id={id("prazo")} rotulo="Prazo de conclusão" obrigatorio erro={erro("prazo")} aviso={avisoPrazoAcao(acao, fimEstimado)}>
                  <Input
                    {...fieldAria(id("prazo"), erro("prazo"))}
                    type="date"
                    value={acao.prazo}
                    min={acao.prazo_inicio || undefined}
                    onChange={(e) => mudarAcao(acao.chave, { prazo: e.target.value })}
                  />
                </Field>

                <Field id={id("prioridade")} rotulo="Prioridade" obrigatorio erro={erro("prioridade")}>
                  <Select
                    {...fieldAria(id("prioridade"), erro("prioridade"))}
                    value={acao.prioridade}
                    onChange={(e) => mudarAcao(acao.chave, { prioridade: e.target.value as Prioridade })}
                  >
                    <option value="">Selecione…</option>
                    {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                      <option key={p} value={p}>
                        {ROTULO_PRIORIDADE[p]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id={id("status")} rotulo="Status" erro={erro("status")}>
                  <Select
                    {...fieldAria(id("status"), erro("status"))}
                    value={acao.status}
                    onChange={(e) => {
                      const status = e.target.value as StatusInicialAcao;
                      mudarAcao(acao.chave, { status, progresso: progressoFixo(status) ?? acao.progresso });
                    }}
                  >
                    {STATUS_INICIAIS.map((s) => (
                      <option key={s} value={s}>
                        {ROTULO_STATUS_ACAO[s]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field id={id("progresso")} rotulo="Progresso (%)" ajuda={fixo !== null ? "Definido pelo status." : undefined}>
                  <Input
                    id={id("progresso")}
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={fixo ?? acao.progresso}
                    readOnly={fixo !== null}
                    onChange={(e) =>
                      mudarAcao(acao.chave, { progresso: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })
                    }
                  />
                </Field>

                {(acoes.length > 1 || existentes.length > 0) && (
                  <fieldset className={`${styles.largo} ${styles.grupoDependencias}`}>
                    <legend>Depende da conclusão de</legend>
                    <p className={styles.notaAcao}>
                      A ação só poderá ser iniciada quando todas as marcadas estiverem concluídas (pode ser aceita e editada antes).
                    </p>
                    {existentes.map((e) => {
                      const marcada = acao.depende_de_ids.includes(e.id);
                      return (
                        <Checkbox
                          key={`e-${e.id}`}
                          rotulo={`${rotuloItem(e.numero)} — ${e.descricao} (${ROTULO_STATUS_ACAO[e.status]})`}
                          checked={marcada}
                          onChange={() =>
                            alterarDependencias(acao, n, !marcada, {
                              depende_de: acao.depende_de,
                              depende_de_ids: marcada ? acao.depende_de_ids.filter((x) => x !== e.id) : [...acao.depende_de_ids, e.id],
                            })
                          }
                        />
                      );
                    })}
                    {acoes.map((outra, j) => {
                      if (outra.chave === acao.chave) return null;
                      // Marcar criaria um ciclo (a outra já depende desta, direta ou indiretamente).
                      const ciclo = dependeDe(acoes, outra.chave, acao.chave);
                      const marcada = acao.depende_de.includes(outra.chave);
                      return (
                        <Checkbox
                          key={outra.chave}
                          rotulo={
                            `${rotuloItem(numero(j))} — ${outra.descricao.trim() || "Sem descrição"}` +
                            (ciclo && !marcada ? " (já depende desta ação)" : "")
                          }
                          checked={marcada}
                          disabled={ciclo && !marcada}
                          onChange={() =>
                            alterarDependencias(acao, n, !marcada, {
                              depende_de: marcada ? acao.depende_de.filter((c) => c !== outra.chave) : [...acao.depende_de, outra.chave],
                              depende_de_ids: acao.depende_de_ids,
                            })
                          }
                        />
                      );
                    })}
                  </fieldset>
                )}

                <Field id={id("observacao")} rotulo="Observação" className={styles.largo}>
                  <Textarea
                    id={id("observacao")}
                    rows={2}
                    maxLength={2000}
                    value={acao.observacao}
                    onChange={(e) => mudarAcao(acao.chave, { observacao: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </section>
        );
      })}

      <Button className={styles.adicionarAcao} onClick={adicionar}>
        {pai ? "+ Adicionar sub-item" : "+ Adicionar ação"}
      </Button>
      {ajuste.modal}
    </div>
  );
}
