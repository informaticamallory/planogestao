import { useState } from "react";

import { formatarData } from "../../../utils/datas";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { analisarAjuste, type AnaliseAjuste, type PreRequisitoPrazo } from "./ajustePrazo";
import styles from "./AjustePrazoDependencia.module.css";

export interface PedidoAjuste {
  /** "Ação 2", "Subação 1.1.1"… (o item que está sendo editado). */
  item: string;
  prazoInicio: string;
  prazo: string;
  /** Todos os pré-requisitos marcados, incluindo o recém-marcado. */
  preRequisitos: PreRequisitoPrazo[];
  /**
   * Aplica a marcação. `novoInicio` = data para o prazo inicial estimado ("Sim, ajustar") ou null
   * ("Não, manter"). "Cancelar" não chama: a flag fica desmarcada e a data não muda.
   */
  marcar: (novoInicio: string | null) => void;
}

const rotulo = (p: PreRequisitoPrazo) => `${p.rotulo}${p.descricao.trim() ? ` — ${p.descricao.trim()}` : ""}`;

/**
 * Pergunta, ao marcar um pré-requisito, se o prazo inicial estimado deve ir para o prazo de conclusão
 * da ação anterior (o maior, se houver várias). Só mexe no formulário: grava ao salvar, e o início
 * da ação continua bloqueado até os pré-requisitos serem concluídos.
 */
export function useAjustePrazoDependencia() {
  const [aberto, setAberto] = useState<{ pedido: PedidoAjuste; analise: AnaliseAjuste } | null>(null);

  const perguntar = (pedido: PedidoAjuste) => {
    const analise = analisarAjuste(pedido.preRequisitos, pedido.prazoInicio, pedido.prazo);
    // Prazo inicial já igual à referência: não há o que ajustar.
    if (analise.tipo === "igual") pedido.marcar(null);
    else setAberto({ pedido, analise });
  };

  const responder = (escolha: "ajustar" | "manter" | "cancelar") => {
    if (!aberto) return; // fechamento do <dialog> depois de uma resposta
    setAberto(null);
    if (escolha === "cancelar") return;
    aberto.pedido.marcar(escolha === "ajustar" && aberto.analise.tipo === "ajustavel" ? aberto.analise.data : null);
  };

  const a = aberto?.analise;
  const p = aberto?.pedido;
  // "Ação" é feminino; "sub-item", masculino.
  const subItem = !!p?.item.startsWith("Sub-item");
  const nome = subItem ? "sub-item" : "ação";
  const desta = subItem ? "deste" : "desta";
  const varios = (p?.preRequisitos.length ?? 0) > 1;

  const modal = (
    <Modal
      aberto={aberto !== null}
      titulo="Ajustar prazo inicial estimado?"
      onFechar={() => responder("cancelar")}
      acoes={
        <>
          <Button onClick={() => responder("cancelar")}>Cancelar</Button>
          <Button onClick={() => responder("manter")}>Não, manter</Button>
          <Button variante="primaria" disabled={a?.tipo !== "ajustavel"} onClick={() => responder("ajustar")}>
            Sim, ajustar
          </Button>
        </>
      }
    >
      {p && a && (
        <>
          <p className={styles.pergunta}>
            Deseja ajustar o prazo inicial estimado {desta} {nome} ({p.item}) para o prazo de conclusão da ação anterior?
          </p>
          <p>{varios ? "Pré-requisitos marcados:" : "Pré-requisito:"}</p>
          <ul className={styles.lista}>
            {p.preRequisitos.map((r) => (
              <li key={r.rotulo}>
                {rotulo(r)} · {r.prazo ? `conclusão prevista em ${formatarData(r.prazo)}` : "sem prazo de conclusão"}
              </li>
            ))}
          </ul>

          {a.tipo === "sem_prazo" ? (
            <p className={styles.alerta} role="alert">
              {a.faltando.map((f) => f.rotulo).join(", ")} ainda não {a.faltando.length > 1 ? "têm" : "tem"} prazo de conclusão. Preencha
              esse prazo para poder ajustar automaticamente. Você pode manter a dependência agora, sem mudar a data, ou cancelar a
              marcação.
            </p>
          ) : (
            <dl className={styles.datas}>
              <dt>Prazo inicial atual</dt>
              <dd>{p.prazoInicio ? formatarData(p.prazoInicio) : "Não informado"}</dd>
              <dt>Ajustado para</dt>
              <dd>
                {formatarData(a.data)}
                {varios && ` (maior prazo, de ${a.origem.rotulo})`}
              </dd>
              <dt>Prazo de conclusão</dt>
              <dd>{p.prazo ? formatarData(p.prazo) : "Não informado"}</dd>
            </dl>
          )}

          {a.tipo === "conflito" && (
            <p className={styles.alerta} role="alert">
              {`Conflito de datas: ${formatarData(a.data)} (${a.origem.rotulo}) é posterior ao prazo de conclusão ${desta} ${nome} `}
              {`(${formatarData(a.prazoItem)}), e o prazo inicial não pode passar do prazo de conclusão. `}
              Revise os prazos ({desta} {nome} ou do pré-requisito) antes de ajustar. Você pode manter a dependência sem mudar a data ou
              cancelar a marcação.
            </p>
          )}

          <p className={styles.nota}>
            A data só é gravada ao salvar. O ajuste não inicia {subItem ? "o" : "a"} {nome}: o início continua bloqueado até a conclusão de todos os
            pré-requisitos.
          </p>
        </>
      )}
    </Modal>
  );

  return { perguntar, modal };
}
