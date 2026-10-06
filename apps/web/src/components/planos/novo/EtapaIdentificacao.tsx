import type { OpcoesPlanos, Prioridade } from "@planogestao/shared-types";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useOrigensDoTipo } from "../../../hooks/usePlanos";
import { ROTULO_PRIORIDADE } from "../../../utils/rotulos";
import { Field, fieldAria } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { UserPicker } from "../../ui/UserPicker";
import { type Erros, type PlanoForm } from "./formularioPlano";
import styles from "./Etapas.module.css";

interface Props {
  form: PlanoForm;
  alterar: (parcial: Partial<PlanoForm>) => void;
  erros: Erros;
  opcoes: OpcoesPlanos | undefined;
  /** Código já gerado (edição). Sem ele, mostra que será gerado ao salvar. */
  codigo?: string;
  /** Substitui a informação de status: a edição mostra o status atual e a liberação do rascunho. */
  campoStatus?: ReactNode;
}

// Área e função/cargo ficam em cada ação (etapa "Ações e Responsável"); a do plano vem da 1ª ação.
export function EtapaIdentificacao({ form, alterar, erros, opcoes, codigo, campoStatus }: Props) {
  // Origem depende do tipo: só as compatíveis (Administração › Tipos de Plano).
  const origens = useOrigensDoTipo(form.tipo_id ? Number(form.tipo_id) : null);
  const tipoTrocado = useRef(false);
  const [avisoOrigem, setAvisoOrigem] = useState<string | null>(null);
  const listaOrigens = origens.data ?? [];
  // Edição de um plano antigo cuja combinação deixou de ser compatível: a origem atual continua visível.
  const origemAtualFora =
    !tipoTrocado.current && form.origem_id && origens.data && !listaOrigens.some((o) => String(o.id) === form.origem_id)
      ? opcoes?.origens.find((o) => String(o.id) === form.origem_id)
      : undefined;

  useEffect(() => {
    // Trocou o tipo e a origem escolhida não vale para o novo: limpa e avisa.
    if (!tipoTrocado.current || !origens.data || !form.origem_id) return;
    if (origens.data.some((o) => String(o.id) === form.origem_id)) return;
    const antiga = opcoes?.origens.find((o) => String(o.id) === form.origem_id)?.nome ?? "anterior";
    const tipo = opcoes?.tipos.find((t) => String(t.id) === form.tipo_id)?.nome ?? "escolhido";
    setAvisoOrigem(`A origem “${antiga}” não é compatível com o tipo “${tipo}” e foi limpa. Escolha outra.`);
    alterar({ origem_id: "" });
  }, [origens.data, form.origem_id, form.tipo_id, opcoes, alterar]);

  return (
    <div className={styles.grade}>
      <Field id="codigo" rotulo="Código" ajuda={codigo ? undefined : "Gerado automaticamente ao salvar (PA-AAAA-NNNN)."}>
        <Input id="codigo" value={codigo ?? ""} placeholder="Será gerado ao salvar" readOnly />
      </Field>

      <Field id="nome" rotulo="Nome do plano" obrigatorio erro={erros.nome} className={styles.largo}>
        <Input {...fieldAria("nome", erros.nome)} value={form.nome} maxLength={200} onChange={(e) => alterar({ nome: e.target.value })} />
      </Field>

      <Field id="tipo" rotulo="Tipo" obrigatorio erro={erros.tipo_id}>
        <Select
          {...fieldAria("tipo", erros.tipo_id)}
          value={form.tipo_id}
          onChange={(e) => {
            tipoTrocado.current = true;
            setAvisoOrigem(null);
            alterar({ tipo_id: e.target.value });
          }}
        >
          <option value="">Selecione…</option>
          {opcoes?.tipos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="origem"
        rotulo="Origem"
        obrigatorio
        erro={erros.origem_id}
        aviso={avisoOrigem}
        ajuda={
          !form.tipo_id
            ? "Escolha o tipo primeiro: a lista mostra só as origens compatíveis com ele."
            : origens.data?.length === 0
              ? "Nenhuma origem configurada para este tipo. Peça à Administração para associar origens ao tipo."
              : undefined
        }
      >
        <Select
          {...fieldAria("origem", erros.origem_id)}
          value={form.origem_id}
          disabled={!form.tipo_id || origens.isLoading}
          onChange={(e) => {
            setAvisoOrigem(null);
            alterar({ origem_id: e.target.value });
          }}
        >
          <option value="">{!form.tipo_id ? "Escolha o tipo antes" : origens.isLoading ? "Carregando…" : "Selecione…"}</option>
          {origemAtualFora && (
            <option value={origemAtualFora.id}>{origemAtualFora.nome} (atual — não compatível com o tipo)</option>
          )}
          {listaOrigens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
      </Field>

      {/* Bloco "responsabilidade e prazo": Responsável | Início | Fim, depois Prioridade | Status. */}
      <fieldset className={`${styles.largo} ${styles.bloco}`}>
        <legend className={styles.legendaBloco}>Responsabilidade e prazo</legend>
        <div className={styles.gradeBloco}>
          <Field id="responsavel" rotulo="Responsável pelo plano" obrigatorio erro={erros.responsavel} className={styles.campoResponsavel}>
            <UserPicker
              id="responsavel"
              ariaLabel="Responsável pelo plano"
              valor={form.responsavel}
              onSelecionar={(responsavel) => alterar({ responsavel })}
              invalido={!!erros.responsavel}
              idErro={erros.responsavel ? "responsavel-erro" : undefined}
            />
          </Field>

          <Field id="data_inicio_estimado" rotulo="Início estimado" obrigatorio erro={erros.data_inicio_estimado}>
            <Input
              {...fieldAria("data_inicio_estimado", erros.data_inicio_estimado)}
              type="date"
              value={form.data_inicio_estimado}
              max={form.data_fim_estimado || undefined}
              onChange={(e) => alterar({ data_inicio_estimado: e.target.value })}
            />
          </Field>

          <Field id="data_fim_estimado" rotulo="Fim estimado" obrigatorio erro={erros.data_fim_estimado}>
            <Input
              {...fieldAria("data_fim_estimado", erros.data_fim_estimado)}
              type="date"
              value={form.data_fim_estimado}
              min={form.data_inicio_estimado || undefined}
              onChange={(e) => alterar({ data_fim_estimado: e.target.value })}
            />
          </Field>

          <Field id="prioridade" rotulo="Prioridade" obrigatorio erro={erros.prioridade}>
            <Select
              {...fieldAria("prioridade", erros.prioridade)}
              value={form.prioridade}
              onChange={(e) => alterar({ prioridade: e.target.value as Prioridade })}
            >
              <option value="">Selecione…</option>
              {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PRIORIDADE[p]}
                </option>
              ))}
            </Select>
          </Field>

          {campoStatus ?? (
            <div className={styles.infoStatus}>
              <span className={styles.rotuloInfo}>Status</span>
              <span>Não iniciado</span>
              <span className={styles.notaAcao}>
                Calculado pelas ações: passa a “Em andamento” quando uma ação é iniciada e a “Concluído” quando todas são
                concluídas. Para salvar sem problema, objetivo e ações, use “Salvar rascunho”.
              </span>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
