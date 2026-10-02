import type { MinhaAcao } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { formatarData } from "../../utils/datas";
import { EXECUCAO_DA_CATEGORIA, ROTULO_PRIORIDADE, ROTULO_STATUS_EXECUCAO, TOKEN_STATUS_EXECUCAO } from "../../utils/rotulos";
import { PrazoTag } from "../ui/StatusBadges";
import styles from "./Listas.module.css";

/** Ações abertas do usuário: status de execução e, ao lado, a tag de prazo (independentes). */
export function MinhasAcoes({ acoes }: { acoes: MinhaAcao[] }) {
  return (
    <ul className={styles.lista}>
      {acoes.map((a) => {
        const execucao = EXECUCAO_DA_CATEGORIA[a.categoria];
        return (
          <li key={a.id} className={styles.itemLista}>
            <div className={styles.linhaPrincipal}>
              <Link to={`/acoes/${a.id}`} className={styles.nome}>
                {a.descricao}
              </Link>
            </div>
            <div className={styles.linhaDetalhe}>
              <span className={styles.codigo}>{a.plano.codigo}</span>
              <span>Prazo {formatarData(a.prazo)}</span>
              <span>Prioridade {ROTULO_PRIORIDADE[a.prioridade].toLowerCase()}</span>
            </div>
            <div className={styles.linhaDetalhe}>
              <span className={styles.situacao}>
                <span
                  className={styles.ponto}
                  style={{ background: `var(${TOKEN_STATUS_EXECUCAO[execucao]})` }}
                  aria-hidden="true"
                />
                {ROTULO_STATUS_EXECUCAO[execucao]}
              </span>
              <PrazoTag tag={a.prazo_tag} />
              <span>{a.progresso}% concluído</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
