import type { PlanoRecente } from "@planogestao/shared-types";

import { formatarData } from "../../utils/datas";
import { ProgressBar } from "../ui/ProgressBar";
import { PlanStatusBadge } from "../ui/StatusBadges";
import styles from "./Listas.module.css";

export function PlanosRecentes({ planos }: { planos: PlanoRecente[] }) {
  return (
    <ul className={styles.lista}>
      {planos.map((p) => (
        <li key={p.id} className={styles.itemLista}>
          <div className={styles.linhaPrincipal}>
            <span className={styles.codigo}>{p.codigo}</span>
            <span className={styles.nome}>{p.nome}</span>
            <PlanStatusBadge status={p.status} prazoTag={p.prazo_tag} />
          </div>
          <div className={styles.linhaDetalhe}>
            <span>{p.responsavel.nome}</span>
            <span>Fim estimado {formatarData(p.data_fim_estimado)}</span>
            <span>
              {p.acoes_concluidas}/{p.total_acoes} ações
            </span>
          </div>
          <ProgressBar valor={p.progresso} rotulo={`Progresso de ${p.codigo}`} />
        </li>
      ))}
    </ul>
  );
}
