import { useEffect, useId, useState } from "react";

import { useAcoesDoPlano, useExcluirPlano } from "../../hooks/usePlano";
import { avisar } from "../../store/avisoStore";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Input";
import { Modal } from "../ui/Modal";
import styles from "./ExcluirPlanoModal.module.css";

interface Props {
  plano: { id: number; codigo: string; nome: string };
  aberto: boolean;
  onFechar: () => void;
  /** Depois do aviso "Plano excluído" (a listagem já é atualizada pela mutação). Ex.: sair do detalhe. */
  onExcluido?: () => void;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quantidade real afetada, pela lista de itens do plano (a mesma que a exclusão leva junto). */
function textoQuantidade(principais: number, subitens: number): string {
  if (principais + subitens === 0) return "Este plano não tem ações nem sub-itens cadastrados.";
  const partes = [principais && plural(principais, "ação", "ações"), subitens && plural(subitens, "sub-item", "sub-itens")].filter(Boolean);
  return `Itens afetados: ${partes.join(" e ")}.`;
}

/**
 * Exclusão lógica do plano (a regra é da API: some das consultas; histórico e anexos ficam para auditoria).
 * A confirmação recomeça desmarcada a cada abertura; durante a operação o modal não fecha nem repete o envio.
 */
export function ExcluirPlanoModal({ plano, aberto, onFechar, onExcluido }: Props) {
  const excluir = useExcluirPlano(plano.id);
  const acoes = useAcoesDoPlano(plano.id, aberto);
  const [confirmado, setConfirmado] = useState(false);
  const idQuantidade = useId();

  useEffect(() => {
    if (!aberto) return;
    setConfirmado(false);
    excluir.reset();
  }, [aberto]);

  const pendente = excluir.isPending;
  const fechar = () => {
    if (!pendente) onFechar();
  };
  const confirmar = () => {
    if (!confirmado || pendente) return;
    excluir.mutate(undefined, {
      onSuccess: () => {
        onFechar();
        avisar("Plano excluído");
        onExcluido?.();
      },
    });
  };

  const lista = acoes.data;
  const principais = lista?.filter((a) => a.acao_pai_id === null).length ?? 0;
  const subitens = (lista?.length ?? 0) - principais;

  return (
    <Modal
      aberto={aberto}
      titulo="Excluir plano?"
      largura="media"
      bloquearFechar={pendente}
      onFechar={fechar}
      acoes={
        <>
          <Button variante="secundaria" onClick={fechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button variante="perigoSolido" onClick={confirmar} disabled={!confirmado || pendente} aria-busy={pendente || undefined}>
            {pendente ? "Excluindo..." : "Excluir plano"}
          </Button>
        </>
      }
    >
      <div className={styles.identificacao}>
        <span className={styles.codigo}>{plano.codigo}</span>
        <span className={styles.nome}>{plano.nome}</span>
      </div>

      <div className={styles.explicacao}>
        <p>Este plano, suas ações e seus sub-itens deixarão de aparecer nas consultas do sistema.</p>
        {/* Quantidade só quando a lista carregou: sem números fixos nem estimados. */}
        {lista && (
          <p id={idQuantidade} className={styles.quantidade}>
            {textoQuantidade(principais, subitens)}
          </p>
        )}
        <p>O histórico e os anexos serão preservados para auditoria.</p>
      </div>

      <Checkbox
        className={styles.confirmacao}
        rotulo={<span>Confirmo a exclusão deste plano e dos seus itens.</span>}
        checked={confirmado}
        disabled={pendente}
        onChange={(e) => setConfirmado(e.target.checked)}
        aria-describedby={lista ? idQuantidade : undefined}
      />

      {excluir.isError && (
        <p className={styles.erro} role="alert">
          Não foi possível excluir o plano: {excluir.error.message}
        </p>
      )}
    </Modal>
  );
}
