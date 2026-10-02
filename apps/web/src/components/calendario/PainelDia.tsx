import type { FiltrosCalendario } from "@planogestao/api-client";
import { Link } from "react-router-dom";

import { useCalendarioDia } from "../../hooks/useCalendario";
import { formatarDiaMes } from "../../utils/datas";
import { SITUACOES_PRAZO } from "../../utils/rotulos";
import { ProgressBar } from "../ui/ProgressBar";
import { Drawer } from "../ui/Drawer";
import { ActionStatusBadge, DeadlineStatusLabel } from "../ui/StatusBadges";
import styles from "./Calendario.module.css";

/** "23/09 — 7 ações previstas": lista vinda de /calendario/dia com os mesmos filtros da grade. */
export function PainelDia({ data, filtros, onFechar }: { data: string; filtros: FiltrosCalendario; onFechar: () => void }) {
  const { data: acoes, isLoading, error } = useCalendarioDia(data, filtros);
  const titulo = acoes
    ? `${formatarDiaMes(data)} — ${acoes.length} ${acoes.length === 1 ? "ação prevista" : "ações previstas"}`
    : formatarDiaMes(data);

  return (
    <Drawer aberto largura={520} titulo={titulo} onFechar={onFechar}>
      {isLoading && <p className={styles.vazio}>Carregando…</p>}
      {error && <p className={styles.erro}>Não foi possível carregar as ações do dia.</p>}
      {acoes && acoes.length === 0 && <p className={styles.vazio}>Nenhuma ação com prazo neste dia.</p>}
      {acoes && acoes.length > 0 && (
        <ul className={styles.listaDia}>
          {acoes.map((a) => {
            const s = SITUACOES_PRAZO.find((x) => x.situacao === a.situacao)!;
            return (
              <li key={a.id} className={styles.itemDia}>
                <Link to={`/acoes/${a.id}`} className={styles.linkAcaoDia}>
                  {a.descricao}
                </Link>
                <span className={styles.metaAcao}>
                  <DeadlineStatusLabel situacao={s.situacao} />
                  <Link to={`/planos/${a.plano.id}`}>{a.plano.codigo}</Link>
                  <span>{a.responsavel.nome}</span>
                </span>
                <div className={styles.linhaItemDia}>
                  <ActionStatusBadge status={a.status} />
                  <ProgressBar valor={a.progresso} rotulo={`Progresso de ${a.descricao}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
