import type { PlanoDaEquipe } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { useAcoesDoPlano } from "../../hooks/usePlano";
import { formatarData } from "../../utils/datas";
import styles from "../admin/Admin.module.css";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ActionStatusBadge } from "../ui/StatusBadges";
import estilos from "./ArvoreEquipes.module.css";

export interface ParticipanteNoPlano {
  plano: PlanoDaEquipe;
  usuarioId: number;
  nome: string;
}

/**
 * Ações e sub-itens atribuídos ao participante NAQUELE plano. Usa a mesma rota das ações do plano, com o acesso
 * de quem consulta (sem acesso ao plano, a API responde 404). Nada é recalculado nem somado aqui.
 */
export function ModalAcoesParticipante({ alvo, onFechar }: { alvo: ParticipanteNoPlano | null; onFechar: () => void }) {
  const acoes = useAcoesDoPlano(alvo?.plano.id ?? 0, alvo !== null);
  const doParticipante = (acoes.data ?? []).filter((a) => a.responsavel.id === alvo?.usuarioId);

  return (
    <Modal
      aberto={alvo !== null}
      titulo={alvo ? `Ações de ${alvo.nome}` : "Ações"}
      onFechar={onFechar}
      acoes={<Button onClick={onFechar}>Fechar</Button>}
    >
      {alvo && (
        <p className={styles.meta}>
          No plano {alvo.plano.codigo} — {alvo.plano.nome}. Só as ações e sub-itens em que {alvo.nome} é o responsável.
        </p>
      )}
      {acoes.error ? (
        <p className={styles.erro}>Não foi possível carregar as ações: {acoes.error.message}</p>
      ) : acoes.isLoading ? (
        <p className={styles.estado}>Carregando…</p>
      ) : doParticipante.length === 0 ? (
        <p className={styles.estado}>Nenhuma ação atribuída a esta pessoa neste plano.</p>
      ) : (
        <ul className={estilos.listaAcoes}>
          {doParticipante.map((a) => (
            <li key={a.id}>
              <Link to={`/acoes/${a.id}`} className={estilos.acao}>
                <span className={estilos.numeroAcao}>{a.numero}</span>
                <span className={estilos.descricaoAcao}>{a.descricao}</span>
              </Link>
              <span className={estilos.metaAcao}>
                <ActionStatusBadge
                  status={a.status}
                  prazoTag={a.prazo_tag}
                  arquivo={alvo?.plano.arquivado ? "plano" : a.arquivada ? "acao" : null}
                />
                <span className={styles.meta}>Prazo {formatarData(a.prazo)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
