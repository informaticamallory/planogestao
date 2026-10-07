import type { EquipeItem } from "@planogestao/shared-types";

import { useExcluirEquipe } from "../../hooks/useEquipes";
import styles from "../admin/Admin.module.css";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

/** Rótulo do plano vinculado: "PA-2026-001 — Nome" ou "Sem plano vinculado". */
export const rotuloPlano = (e: Pick<EquipeItem, "plano">) => (e.plano ? `${e.plano.codigo} — ${e.plano.nome}` : "Sem plano vinculado");

/** O que a confirmação precisa (serve para a equipe da lista, do detalhe ou da árvore). */
export type EquipeParaExcluir = Pick<EquipeItem, "id" | "nome" | "plano">;

/** Confirmação da exclusão (lógica) identificando a equipe e o plano. */
export function ModalExcluirEquipe({
  equipe,
  onFechar,
  onExcluida,
}: {
  equipe: EquipeParaExcluir | null;
  onFechar: () => void;
  onExcluida?: () => void;
}) {
  const excluir = useExcluirEquipe();
  const fechar = () => {
    excluir.reset();
    onFechar();
  };
  return (
    <Modal
      aberto={equipe !== null}
      titulo="Excluir equipe"
      onFechar={fechar}
      acoes={
        <>
          <Button onClick={fechar}>Cancelar</Button>
          <Button
            variante="perigo"
            disabled={excluir.isPending}
            onClick={() =>
              equipe &&
              excluir.mutate(equipe.id, {
                onSuccess: () => {
                  fechar();
                  onExcluida?.();
                },
              })
            }
          >
            {excluir.isPending ? "Excluindo…" : "Excluir equipe"}
          </Button>
        </>
      }
    >
      {excluir.error && <p className={styles.erro}>{excluir.error.message}</p>}
      {equipe && (
        <>
          <p>
            Excluir a equipe <strong>“{equipe.nome}”</strong> do plano <strong>{rotuloPlano(equipe)}</strong>?
          </p>
          <p className={styles.meta}>
            A equipe sai das consultas, mas o registro e o histórico ficam guardados. O plano, as ações, os responsáveis pelas
            ações e os usuários não são alterados.
          </p>
        </>
      )}
    </Modal>
  );
}
