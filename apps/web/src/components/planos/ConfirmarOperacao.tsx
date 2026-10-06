import { useEffect, useState, type ReactNode } from "react";

import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Input";
import { Modal } from "../ui/Modal";
import styles from "./ConfirmarOperacao.module.css";

interface Props {
  aberto: boolean;
  titulo: string;
  /** Identificação do item (código, número, descrição). */
  identificacao: ReactNode;
  children: ReactNode;
  rotuloBotao: string;
  /** Exclusão: botão vermelho e caixa "Confirmo" obrigatória. */
  destrutiva?: boolean;
  pendente?: boolean;
  erro?: string | null;
  onConfirmar: () => void;
  onFechar: () => void;
}

/** Confirmação de arquivamento/exclusão (plano ou ação), sempre identificando o item. */
export function ConfirmarOperacao({ aberto, titulo, identificacao, children, rotuloBotao, destrutiva, pendente, erro, onConfirmar, onFechar }: Props) {
  const [confirmado, setConfirmado] = useState(false);
  useEffect(() => {
    if (aberto) setConfirmado(false);
  }, [aberto]);

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button variante={destrutiva ? "perigo" : "primaria"} disabled={pendente || (destrutiva && !confirmado)} onClick={onConfirmar}>
            {pendente ? "Salvando…" : rotuloBotao}
          </Button>
        </>
      }
    >
      <p className={styles.identificacao}>{identificacao}</p>
      {children}
      {destrutiva && (
        <Checkbox
          className={styles.confirmacao}
          rotulo="Confirmo a exclusão. Entendo que os itens saem de todas as listas e consultas."
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
        />
      )}
      {erro && (
        <p className={styles.erro} role="alert">
          {erro}
        </p>
      )}
    </Modal>
  );
}
