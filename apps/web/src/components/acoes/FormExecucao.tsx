import type { AcaoAtualizar, AcaoDetalhe, StatusAcao } from "@planogestao/shared-types";
import { useEffect, useState } from "react";

import { useAtualizarAcao } from "../../hooks/useAcao";
import { formatarData } from "../../utils/datas";
import { ROTULO_STATUS_ACAO } from "../../utils/rotulos";
import { Button } from "../ui/Button";
import { Field, fieldAria } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import styles from "./Acao.module.css";
import { FormSolicitacao } from "./BlocosFluxo";

const COM_PROGRESSO: StatusAcao[] = ["em_andamento", "bloqueada"];

interface Rascunho {
  status: StatusAcao;
  progresso: number;
  observacao: string;
  prazo: string;
  motivo_bloqueio: string;
  justificativa: string;
  motivo_prazo: string;
}

const doDetalhe = (a: AcaoDetalhe): Rascunho => ({
  status: a.status,
  progresso: a.progresso,
  observacao: a.observacao ?? "",
  prazo: a.prazo,
  motivo_bloqueio: "",
  justificativa: "",
  motivo_prazo: "",
});

/** Status, progresso, observação e (para gestores) prazo. Envia só o que mudou. */
export function FormExecucao({ acao }: { acao: AcaoDetalhe }) {
  const p = acao.permissoes;
  const [r, setR] = useState<Rascunho>(() => doDetalhe(acao));
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [solicitando, setSolicitando] = useState(false);
  const atualizar = useAtualizarAcao(acao.id);

  // Depois de salvar (ou de outra mudança na ação), o formulário parte dos dados atuais.
  useEffect(() => setR(doDetalhe(acao)), [acao]);

  const mudar = (parcial: Partial<Rascunho>) => setR((atual) => ({ ...atual, ...parcial }));
  const concluindo = r.status === "concluida";
  const progressoEditavel = p.editar_execucao && COM_PROGRESSO.includes(r.status);
  const progressoExibido = concluindo ? 100 : r.progresso;

  const alteracoes: AcaoAtualizar = {};
  if (r.status !== acao.status) alteracoes.status = r.status;
  if (progressoEditavel && r.progresso !== acao.progresso) alteracoes.progresso = r.progresso;
  if (r.observacao.trim() !== (acao.observacao ?? "")) alteracoes.observacao = r.observacao.trim();
  const mudouPrazo = p.editar_prazo && r.prazo !== acao.prazo;
  if (mudouPrazo) alteracoes.prazo = r.prazo;
  if (mudouPrazo && r.motivo_prazo.trim()) alteracoes.motivo_alteracao_prazo = r.motivo_prazo.trim();
  if (r.status === "bloqueada" && acao.status !== "bloqueada") alteracoes.motivo_bloqueio = r.motivo_bloqueio.trim();
  const cancelando = r.status === "cancelada" && acao.status !== "cancelada";
  const ehSubacao = acao.acao_origem !== null;
  if (cancelando && r.justificativa.trim()) alteracoes.justificativa = r.justificativa.trim();
  const temAlteracao = Object.keys(alteracoes).length > 0;

  const salvar = () => {
    setErro(null);
    if (alteracoes.status === "bloqueada" && !alteracoes.motivo_bloqueio) return setErro("Informe o motivo do bloqueio.");
    if (cancelando && ehSubacao && !alteracoes.justificativa) return setErro("Informe a justificativa do cancelamento do sub-item.");
    if (alteracoes.status === "cancelada" && !window.confirm("Cancelar esta ação? Ela deixa de contar nos indicadores e não poderá mais ser alterada.")) return;
    atualizar.mutate(alteracoes, { onSuccess: (res) => setAvisos(res.avisos) });
  };

  return (
    <section className={styles.bloco} aria-labelledby="titulo-execucao">
      <h2 id="titulo-execucao" className={styles.tituloBloco}>
        Execução
      </h2>

      <div className={styles.linhaCampos}>
        <Field id="status" rotulo="Status">
          <Select id="status" value={r.status} onChange={(e) => mudar({ status: e.target.value as StatusAcao })} disabled={p.transicoes.length === 0}>
            <option value={acao.status}>{ROTULO_STATUS_ACAO[acao.status]} (atual)</option>
            {p.transicoes.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_ACAO[s]}
              </option>
            ))}
          </Select>
        </Field>

        {p.editar_prazo ? (
          <Field id="prazo" rotulo="Prazo de conclusão" aviso={r.prazo > acao.plano.data_fim_estimado ? `Após o fim estimado do plano (${formatarData(acao.plano.data_fim_estimado)}).` : null}>
            <Input id="prazo" type="date" value={r.prazo} onChange={(e) => mudar({ prazo: e.target.value })} />
          </Field>
        ) : (
          <div className={styles.infoPrazo}>
            <span className={styles.rotuloInfo}>Prazo de conclusão</span>
            <span>{formatarData(acao.prazo)}</span>
            {p.solicitar_alteracao && acao.status !== "aguardando_aceite" && !solicitando && (
              <Button variante="link" className={styles.link} onClick={() => setSolicitando(true)}>
                Solicitar alteração de prazo
              </Button>
            )}
          </div>
        )}
      </div>

      {mudouPrazo && (
        <Field id="motivo_prazo" rotulo="Motivo da alteração de prazo" ajuda="Opcional. Vai para o histórico e para o aviso ao responsável e ao gestor do plano.">
          <Input {...fieldAria("motivo_prazo")} maxLength={500} value={r.motivo_prazo} onChange={(e) => mudar({ motivo_prazo: e.target.value })} />
        </Field>
      )}

      {solicitando && <FormSolicitacao acao={acao} onFechar={() => setSolicitando(false)} />}

      {r.status === "bloqueada" && acao.status !== "bloqueada" && (
        <Field id="motivo_bloqueio" rotulo="Motivo do bloqueio" obrigatorio>
          <Input {...fieldAria("motivo_bloqueio")} maxLength={500} value={r.motivo_bloqueio} onChange={(e) => mudar({ motivo_bloqueio: e.target.value })} />
        </Field>
      )}
      {acao.status === "bloqueada" && acao.motivo_bloqueio && (
        <p className={styles.textoApoio}>Bloqueada: {acao.motivo_bloqueio}</p>
      )}
      {cancelando && (
        <Field
          id="justificativa"
          rotulo="Justificativa do cancelamento"
          obrigatorio={ehSubacao}
          ajuda={
            ehSubacao
              ? "O sub-item cancelado continua no histórico da ação principal."
              : acao.subacoes_pendentes > 0
                ? `Os ${acao.subacoes_pendentes} sub-item(ns) em aberto serão cancelados junto.`
                : undefined
          }
        >
          <Input {...fieldAria("justificativa")} maxLength={500} value={r.justificativa} onChange={(e) => mudar({ justificativa: e.target.value })} />
        </Field>
      )}
      {r.status === "concluida" && acao.status !== "concluida" && acao.subacoes_pendentes > 0 && (
        <p className={styles.erro}>
          Há {acao.subacoes_pendentes} sub-item(ns) em aberto: conclua ou cancele-os antes de concluir este item.
        </p>
      )}

      <Field
        id="progresso"
        rotulo={`Progresso: ${progressoExibido}%`}
        ajuda={
          concluindo ? "Ao concluir, o progresso vai para 100%." : !progressoEditavel ? "Editável com a ação em andamento ou bloqueada." : undefined
        }
      >
        <div className={styles.controleProgresso}>
          <input
            id="progresso"
            type="range"
            min={0}
            max={100}
            step={5}
            value={progressoExibido}
            disabled={!progressoEditavel}
            onChange={(e) => mudar({ progresso: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={0}
            max={100}
            aria-label="Progresso em porcentagem"
            className={styles.numeroProgresso}
            value={progressoExibido}
            disabled={!progressoEditavel}
            onChange={(e) => mudar({ progresso: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
          />
        </div>
      </Field>

      <Field id="observacao" rotulo="Observação">
        <Textarea
          id="observacao"
          rows={3}
          maxLength={2000}
          value={r.observacao}
          disabled={!p.editar_execucao}
          onChange={(e) => mudar({ observacao: e.target.value })}
        />
      </Field>

      {(erro || atualizar.isError) && (
        <p className={styles.erro} role="alert">
          {erro ?? atualizar.error?.message}
        </p>
      )}
      {avisos.length > 0 && (
        <ul className={styles.avisos} role="status">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {(p.editar_execucao || p.editar_prazo) && (
        <div className={styles.botoes}>
          <Button onClick={() => setR(doDetalhe(acao))} disabled={!temAlteracao || atualizar.isPending}>
            Desfazer
          </Button>
          <Button variante="primaria" onClick={salvar} disabled={!temAlteracao || atualizar.isPending}>
            {atualizar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
    </section>
  );
}
