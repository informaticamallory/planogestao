import type { AtividadeRecente } from "@planogestao/shared-types";

import { formatarDataHora, formatarRelativo } from "../../utils/datas";
import { descreverEventoAcao } from "../../utils/historico";
import styles from "./Listas.module.css";

export function AtividadesRecentes({ atividades }: { atividades: AtividadeRecente[] }) {
  return (
    <ul className={styles.lista}>
      {atividades.map((a) => (
        <li key={a.id} className={styles.itemLista}>
          <p className={styles.frase}>
            {/* Mesma frase do histórico da ação (reconhece sub-itens, pré-requisitos, prazos…). */}
            <strong>{a.usuario.nome}</strong> {descreverEventoAcao(a)}
          </p>
          <div className={styles.linhaDetalhe}>
            <span className={styles.codigo}>{a.plano.codigo}</span>
            <span className={styles.nome}>{a.acao_descricao}</span>
            <time dateTime={a.criado_em} title={formatarDataHora(a.criado_em)}>
              {formatarRelativo(a.criado_em)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
