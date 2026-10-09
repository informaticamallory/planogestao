import type { AcaoDoPlano, Prioridade } from "@planogestao/shared-types";
import { useState } from "react";

import { useOpcoesPlanos } from "../../../hooks/usePlanos";
import { formatarData } from "../../../utils/datas";
import { ROTULO_PRIORIDADE, ROTULO_STATUS_ACAO } from "../../../utils/rotulos";
import { Field, fieldAria } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Checkbox, Input, Textarea } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { UserPicker } from "../../ui/UserPicker";
import { useAjustePrazoDependencia } from "./AjustePrazoDependencia";
import { alteracoesDoItem, chaveItem, type Erros, type ItemForm } from "./formularioPlano";
import styles from "./Etapas.module.css";

interface Props {
  itens: ItemForm[];
  /** Estado em que a página abriu: o que mudou vai para a API (pelo id); o resto não é tocado. */
  originais: ItemForm[];
  onAlterar: (itens: ItemForm[]) => void;
  erros: Erros;
  /** Para o aviso de prazo do item posterior ao fim estimado do plano. */
  fimEstimado: string;
  /** Lista do plano (vínculo pai/filho pelo id), para não oferecer como pré-requisito a própria linhagem. */
  acoesDoPlano: AcaoDoPlano[];
}

const rotuloItem = (i: Pick<ItemForm, "subitem" | "numero">) => `${i.subitem ? "Sub-item" : "Ação"} ${i.numero}`;
const ENCERRADOS = new Set(["concluida", "cancelada", "recusada"]);

/** Por que o item não é editável aqui (a API devolve `editar_planejamento` já com perfil, papel e situação). */
function motivoSomenteLeitura(i: ItemForm): string {
  if (ENCERRADOS.has(i.status)) return `${ROTULO_STATUS_ACAO[i.status]}: somente consulta (reabra pela tela do item, se preciso).`;
  return "Você não pode alterar o planejamento deste item (é preciso ser o gestor do plano ou do item acima, aprovar prazos ou ter “Editar planos”).";
}

/**
 * Ações e sub-itens JÁ cadastrados, na edição do plano: cartões que contraem, com o planejamento editável
 * (descrição, responsável, área/função-cargo, prazos, prioridade, observação e pré-requisitos). Nada é recriado:
 * ao salvar, cada item alterado vai pelo id, com histórico campo a campo. Status, progresso, aceite e conclusão
 * seguem pela tela do item; arquivar e excluir, pelo menu da aba Ações.
 */
export function EtapaItensExistentes({ itens, originais, onAlterar, erros, fimEstimado, acoesDoPlano }: Props) {
  const opcoes = useOpcoesPlanos().data;
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const ajuste = useAjustePrazoDependencia();
  const original = new Map(originais.map((o) => [o.id, o]));
  const pai = new Map(acoesDoPlano.map((a) => [a.id, a.acao_pai_id]));

  const mudar = (id: number, parcial: Partial<ItemForm>) => onAlterar(itens.map((i) => (i.id === id ? { ...i, ...parcial } : i)));
  const alternar = (id: number) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });

  const ancestrais = (id: number) => {
    const r = new Set<number>();
    for (let p = pai.get(id) ?? null; p !== null && !r.has(p); p = pai.get(p) ?? null) r.add(p);
    return r;
  };
  /** `id` depende (direta ou indiretamente, pelo estado atual do formulário) de `alvo`? */
  const dependeDe = (id: number, alvo: number, vistos = new Set<number>()): boolean => {
    if (vistos.has(id)) return false;
    vistos.add(id);
    const deps = itens.find((x) => x.id === id)?.depende_de_ids ?? acoesDoPlano.find((a) => a.id === id)?.depende_de.map((p) => p.id) ?? [];
    return deps.some((d) => d === alvo || dependeDe(d, alvo, vistos));
  };

  if (itens.length === 0) return <p className={styles.notaAcao}>Este plano ainda não tem ações cadastradas.</p>;

  return (
    <div className={styles.acoes}>
      {itens.map((item) => {
        const o = original.get(item.id)!;
        const id = (campo: string) => `${chaveItem(item.id)}-${campo}`;
        const erro = (campo: string) => erros[`${chaveItem(item.id)}.${campo}`];
        const comErro = Object.keys(erros).some((k) => k.startsWith(`${chaveItem(item.id)}.`));
        const aberto = item.editavel && (abertos.has(item.id) || comErro);
        const alterado = alteracoesDoItem(item, o) !== null;
        const area = opcoes?.areas.find((a) => String(a.id) === item.area_id)?.nome;
        const setor = opcoes?.setores.find((s) => String(s.id) === item.setor_id)?.nome;
        const setores = (opcoes?.setores ?? []).filter((s) => String(s.area_id) === item.area_id);
        const mudouPrazo = item.prazo !== o.prazo || (!!item.prazo_inicio && item.prazo_inicio !== o.prazo_inicio);
        // Pré-requisitos possíveis: qualquer item do plano, fora o próprio, os de cima e os de baixo (travariam a conclusão).
        // Lista do plano inteira (como no detalhe do item), com os valores já editados quando o item está no formulário.
        const acima = ancestrais(item.id);
        const candidatas = acoesDoPlano
          .filter((c) => c.id !== item.id && !acima.has(c.id) && !ancestrais(c.id).has(item.id) && c.status !== "cancelada" && c.status !== "recusada")
          .map((c) => {
            const f = itens.find((x) => x.id === c.id);
            return { id: c.id, rotulo: rotuloItem({ subitem: c.acao_pai_id !== null, numero: c.numero }), descricao: f?.descricao ?? c.descricao, prazo: f?.prazo ?? c.prazo, status: c.status, arquivada: c.arquivada };
          });
        const marcar = (c: (typeof candidatas)[number], marcada: boolean) => {
          if (marcada) return mudar(item.id, { depende_de_ids: item.depende_de_ids.filter((x) => x !== c.id) });
          const depende_de_ids = [...item.depende_de_ids, c.id];
          ajuste.perguntar({
            item: rotuloItem(item),
            prazoInicio: item.prazo_inicio,
            prazo: item.prazo,
            preRequisitos: depende_de_ids.flatMap((d) => {
              const p = candidatas.find((x) => x.id === d);
              return p ? [{ rotulo: p.rotulo, descricao: p.descricao, prazo: p.prazo || null }] : [];
            }),
            marcar: (novoInicio) => mudar(item.id, novoInicio ? { depende_de_ids, prazo_inicio: novoInicio } : { depende_de_ids }),
          });
        };

        return (
          <section
            key={item.id}
            className={item.editavel ? styles.cartaoAcao : `${styles.cartaoAcao} ${styles.cartaoLeitura}`}
            style={item.nivel ? { marginLeft: `${Math.min(item.nivel, 4) * 1.25}rem` } : undefined}
            aria-label={rotuloItem(item)}
          >
            <div className={styles.topoAcao}>
              <button
                type="button"
                className={styles.cabecalhoAcao}
                aria-expanded={item.editavel ? aberto : undefined}
                aria-controls={item.editavel ? id("corpo") : undefined}
                onClick={() => item.editavel && alternar(item.id)}
                disabled={!item.editavel}
                title={item.editavel ? (comErro ? "Corrija os campos destacados para poder contrair" : aberto ? "Contrair" : "Editar") : undefined}
              >
                <span className={styles.linhaTituloAcao}>
                  <Icon name={item.editavel ? (aberto ? "chevronDown" : "chevronRight") : "lock"} size={16} />
                  <span className={styles.numeroAcao}>{rotuloItem(item)}</span>
                  <span className={styles.resumoAcao}>{item.descricao.trim() || "Sem descrição"}</span>
                </span>
                <span className={styles.metaAcao}>
                  <span>{area ? (setor ? `${area} / ${setor}` : area) : "Sem área"}</span>
                  <span>{item.responsavel?.nome ?? "Sem responsável"}</span>
                  <span>
                    {item.prazo_inicio ? formatarData(item.prazo_inicio) : "?"} → {item.prazo ? formatarData(item.prazo) : "?"}
                  </span>
                  <span>{ROTULO_STATUS_ACAO[item.status]}</span>
                  {item.solicitacaoPendente && <span className={styles.seloDependencia}>Prazo em negociação</span>}
                  {alterado && <span className={styles.seloAlterado}>Alterado</span>}
                  {comErro && <span className={styles.seloPendencia}>Campos pendentes</span>}
                </span>
              </button>
            </div>
            {!item.editavel && <p className={styles.notaAcao}>{motivoSomenteLeitura(item)}</p>}

            {item.editavel && (
              <div id={id("corpo")} className={styles.corpoAcao} hidden={!aberto}>
                <div className={styles.grade}>
                  <Field id={id("descricao")} rotulo="O que será feito" obrigatorio erro={erro("descricao")} className={styles.largo}>
                    <Textarea
                      {...fieldAria(id("descricao"), erro("descricao"))}
                      rows={2}
                      maxLength={2000}
                      value={item.descricao}
                      onChange={(e) => mudar(item.id, { descricao: e.target.value })}
                    />
                  </Field>

                  <Field
                    id={id("responsavel")}
                    rotulo="Responsável"
                    obrigatorio
                    erro={erro("responsavel")}
                    ajuda="Precisa ter a área do plano entre as autorizadas. O novo responsável é avisado; status, prazos e pontos não mudam."
                  >
                    <UserPicker
                      id={id("responsavel")}
                      ariaLabel={`Responsável — ${rotuloItem(item)}`}
                      valor={item.responsavel}
                      onSelecionar={(responsavel) => mudar(item.id, { responsavel })}
                      invalido={!!erro("responsavel")}
                      idErro={erro("responsavel") ? `${id("responsavel")}-erro` : undefined}
                    />
                  </Field>

                  <Field id={id("area")} rotulo="Área" obrigatorio erro={erro("area_id")}>
                    <Select
                      {...fieldAria(id("area"), erro("area_id"))}
                      value={item.area_id}
                      onChange={(e) => mudar(item.id, { area_id: e.target.value, setor_id: "" })}
                    >
                      <option value="">Selecione…</option>
                      {opcoes?.areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field id={id("setor")} rotulo="Função/Cargo">
                    <Select id={id("setor")} value={item.setor_id} disabled={!item.area_id} onChange={(e) => mudar(item.id, { setor_id: e.target.value })}>
                      <option value="">Nenhuma</option>
                      {setores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field id={id("prazo_inicio")} rotulo="Prazo inicial estimado" erro={erro("prazo_inicio")} ajuda="Previsão de início.">
                    <Input
                      {...fieldAria(id("prazo_inicio"), erro("prazo_inicio"))}
                      type="date"
                      value={item.prazo_inicio}
                      max={item.prazo || undefined}
                      onChange={(e) => mudar(item.id, { prazo_inicio: e.target.value })}
                    />
                  </Field>

                  <Field
                    id={id("prazo")}
                    rotulo="Prazo de conclusão"
                    obrigatorio
                    erro={erro("prazo")}
                    ajuda={item.solicitacaoPendente ? "Há um pedido de prazo aguardando resposta (tela do item)." : undefined}
                    aviso={
                      item.prazo && fimEstimado && item.prazo > fimEstimado
                        ? `O prazo deste item é posterior ao fim estimado do plano (${formatarData(fimEstimado)}).`
                        : null
                    }
                  >
                    <Input
                      {...fieldAria(id("prazo"), erro("prazo"))}
                      type="date"
                      value={item.prazo}
                      min={item.prazo_inicio || undefined}
                      onChange={(e) => mudar(item.id, { prazo: e.target.value })}
                    />
                  </Field>

                  {mudouPrazo && (
                    <Field id={id("motivo_prazo")} rotulo="Motivo da alteração de prazo" ajuda="Opcional. Vai para o histórico e para o aviso aos envolvidos.">
                      <Input
                        {...fieldAria(id("motivo_prazo"))}
                        maxLength={500}
                        value={item.motivo_prazo}
                        onChange={(e) => mudar(item.id, { motivo_prazo: e.target.value })}
                      />
                    </Field>
                  )}

                  <Field id={id("prioridade")} rotulo="Prioridade" obrigatorio erro={erro("prioridade")}>
                    <Select
                      {...fieldAria(id("prioridade"), erro("prioridade"))}
                      value={item.prioridade}
                      onChange={(e) => mudar(item.id, { prioridade: e.target.value as Prioridade })}
                    >
                      <option value="">Selecione…</option>
                      {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_PRIORIDADE[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className={styles.infoStatus}>
                    <span className={styles.rotuloInfo}>Status</span>
                    <span>
                      {ROTULO_STATUS_ACAO[item.status]} · {acoesDoPlano.find((a) => a.id === item.id)?.progresso ?? 0}%
                    </span>
                    <span className={styles.notaAcao}>Status e progresso seguem o fluxo do item (aceite, execução e conclusão).</span>
                  </div>

                  {candidatas.length > 0 && (
                    <fieldset className={`${styles.largo} ${styles.grupoDependencias}`} aria-describedby={erro("depende_de") ? `${id("dep")}-erro` : undefined}>
                      <legend>Depende da conclusão de</legend>
                      <p className={styles.notaAcao}>
                        {item.subitem
                          ? "Além destes, o sub-item segue os pré-requisitos dos itens acima dele."
                          : "A ação só poderá ser iniciada quando todas as marcadas estiverem concluídas."}
                      </p>
                      {erro("depende_de") && (
                        <p id={`${id("dep")}-erro`} className={styles.erroLista} role="alert">
                          {erro("depende_de")}
                        </p>
                      )}
                      {candidatas.map((c) => {
                        const marcada = item.depende_de_ids.includes(c.id);
                        const ciclo = dependeDe(c.id, item.id);
                        return (
                          <Checkbox
                            key={c.id}
                            rotulo={`${c.rotulo} — ${c.descricao.trim() || "Sem descrição"} (${ROTULO_STATUS_ACAO[c.status]}${c.arquivada ? ", arquivado" : ""})${ciclo && !marcada ? " — já depende deste item" : ""}`}
                            checked={marcada}
                            disabled={ciclo && !marcada}
                            onChange={() => marcar(c, marcada)}
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
                      value={item.observacao}
                      onChange={(e) => mudar(item.id, { observacao: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>
        );
      })}
      {ajuste.modal}
    </div>
  );
}
