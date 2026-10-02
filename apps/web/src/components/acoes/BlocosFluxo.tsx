/** Blocos do fluxo de aceite e contraproposta de prazo. */
import type { AcaoDetalhe } from "@planogestao/shared-types";
import { useState } from "react";

import { useAceitarAcao, useResponderSolicitacao, useSolicitarAlteracao } from "../../hooks/useAcao";
import { formatarData, formatarDataHora, paraIsoData } from "../../utils/datas";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Field, fieldAria } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import styles from "./Acao.module.css";

export function FormSolicitacao({ acao, onFechar }: { acao: AcaoDetalhe; onFechar: () => void }) {
  const [prazo, setPrazo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const solicitar = useSolicitarAlteracao(acao.id);
  const hoje = paraIsoData(new Date());

  const erros: Record<string, string> = {};
  if (!prazo) erros.prazo = "Informe o novo prazo sugerido.";
  else if (prazo < hoje) erros.prazo = "O prazo sugerido não pode estar no passado.";
  else if (prazo === acao.prazo) erros.prazo = "O prazo sugerido é igual ao atual.";
  if (motivo.trim().length < 5) erros.motivo = "Explique o motivo (mínimo 5 caracteres).";
  const visiveis = tentou ? erros : {};

  const enviar = () => {
    setTentou(true);
    if (Object.keys(erros).length) return;
    solicitar.mutate({ novo_prazo_sugerido: prazo, motivo: motivo.trim() }, { onSuccess: onFechar });
  };

  return (
    <div className={styles.formSolicitacao}>
      <p className={styles.textoApoio}>
        Prazo atual: <strong>{formatarData(acao.prazo)}</strong>. O gestor do plano será notificado e poderá aprovar ou recusar.
      </p>
      <div className={styles.linhaCampos}>
        <Field id="novo-prazo" rotulo="Novo prazo sugerido" obrigatorio erro={visiveis.prazo}>
          <Input {...fieldAria("novo-prazo", visiveis.prazo)} type="date" min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Field>
      </div>
      <Field id="motivo" rotulo="Motivo" obrigatorio erro={visiveis.motivo}>
        <Textarea {...fieldAria("motivo", visiveis.motivo)} rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      {solicitar.isError && <p className={styles.erro}>{solicitar.error.message}</p>}
      <div className={styles.botoes}>
        <Button onClick={onFechar}>Cancelar</Button>
        <Button variante="primaria" onClick={enviar} disabled={solicitar.isPending}>
          {solicitar.isPending ? "Enviando…" : "Enviar solicitação"}
        </Button>
      </div>
    </div>
  );
}

/** Para o responsável, enquanto a ação aguarda aceite. */
export function BlocoAceite({ acao }: { acao: AcaoDetalhe }) {
  const [solicitando, setSolicitando] = useState(false);
  const aceitar = useAceitarAcao(acao.id);
  const pendente = acao.solicitacao_pendente;

  return (
    <section className={`${styles.bloco} ${styles.blocoDestaque}`} aria-labelledby="titulo-aceite">
      <h2 id="titulo-aceite" className={styles.tituloBloco}>
        Nova ação atribuída a você
      </h2>
      {pendente ? (
        <p className={styles.textoApoio} role="status">
          Você sugeriu mudar o prazo para <strong>{formatarData(pendente.novo_prazo_sugerido)}</strong> em{" "}
          {formatarDataHora(pendente.criado_em)}. Aguardando resposta do gestor — se aprovada, a ação é aceita automaticamente.
        </p>
      ) : solicitando ? (
        <FormSolicitacao acao={acao} onFechar={() => setSolicitando(false)} />
      ) : (
        <>
          <p className={styles.textoApoio}>
            Prazo: <strong>{formatarData(acao.prazo)}</strong>. Aceite a ação ou proponha outro prazo.
          </p>
          {aceitar.isError && <p className={styles.erro}>{aceitar.error.message}</p>}
          <div className={styles.botoes}>
            <Button variante="primaria" onClick={() => aceitar.mutate()} disabled={aceitar.isPending}>
              <Icon name="check" size={16} />
              {aceitar.isPending ? "Aceitando…" : "Aceitar"}
            </Button>
            <Button onClick={() => setSolicitando(true)}>
              <Icon name="refresh" size={16} />
              Solicitar alteração
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Para o gestor/criador do plano, quando há solicitação pendente de outra pessoa. */
export function BlocoRespostaSolicitacao({ acao }: { acao: AcaoDetalhe }) {
  const s = acao.solicitacao_pendente!;
  const [justificativa, setJustificativa] = useState("");
  const responder = useResponderSolicitacao(acao.id);
  const enviar = (aprovado: boolean) =>
    responder.mutate({ solicitacaoId: s.id, aprovado, justificativa: justificativa.trim() || null });

  return (
    <section className={`${styles.bloco} ${styles.blocoDestaque}`} aria-labelledby="titulo-solicitacao">
      <h2 id="titulo-solicitacao" className={styles.tituloBloco}>
        Solicitação de alteração de prazo
      </h2>
      <p className={styles.textoApoio}>
        <strong>{s.solicitado_por.nome}</strong> pediu em {formatarDataHora(s.criado_em)} para mudar o prazo de{" "}
        <strong>{formatarData(s.prazo_anterior)}</strong> para <strong>{formatarData(s.novo_prazo_sugerido)}</strong>
        {s.novo_prazo_sugerido > acao.plano.data_fim_estimado && ` (após o fim estimado do plano, ${formatarData(acao.plano.data_fim_estimado)})`}.
      </p>
      <blockquote className={styles.motivo}>{s.motivo}</blockquote>
      {s.feita_antes_do_aceite && (
        <p className={styles.textoApoio}>Pedido feito antes do aceite: ao aprovar, a ação é aceita automaticamente.</p>
      )}
      <Field id="justificativa" rotulo="Justificativa (opcional)">
        <Textarea id="justificativa" rows={2} maxLength={1000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
      </Field>
      {responder.isError && <p className={styles.erro}>{responder.error.message}</p>}
      <div className={styles.botoes}>
        <Button variante="primaria" onClick={() => enviar(true)} disabled={responder.isPending}>
          Aceitar alteração
        </Button>
        <Button variante="perigo" onClick={() => enviar(false)} disabled={responder.isPending}>
          Recusar alteração
        </Button>
      </div>
    </section>
  );
}
