import type { CategoriaPontuacao, ColaboradorRanking } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { useItensParticipante } from "../../hooks/useGamificacao";
import { formatarData, formatarDataHora } from "../../utils/datas";
import { Drawer } from "../ui/Drawer";
import { Table } from "../ui/Table";
import styles from "./Gamificacao.module.css";
import { ROTULO_CLASSIFICACAO } from "./rotulos";

interface Props {
  participante: ColaboradorRanking | null;
  periodoId: number | undefined;
  categoria: CategoriaPontuacao;
  onFechar: () => void;
}

/** Itens (lançamentos) que compõem a pontuação de um participante no período. */
export function DetalheParticipante({ participante, periodoId, categoria, onFechar }: Props) {
  const itens = useItensParticipante(participante?.usuario_id ?? null, periodoId, categoria);

  return (
    <Drawer aberto={!!participante} titulo={participante ? `Pontuação de ${participante.nome}` : "Pontuação"} onFechar={onFechar} largura={640}>
      {itens.error ? (
        <p className={styles.erro}>Não foi possível carregar os itens: {itens.error.message}</p>
      ) : !itens.data ? (
        <p className={styles.vazio}>Carregando…</p>
      ) : (
        <>
          <p className={styles.nota}>
            {itens.data.items.length} item(ns) · <strong>{itens.data.total.toLocaleString("pt-BR")} pts</strong> como{" "}
            {categoria === "gestor" ? "gestor" : "executor"}.
          </p>
          <Table className={styles.ranking}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Conclusão</th>
                {categoria === "executor" && <th scope="col">Prazo</th>}
                <th scope="col">Classificação</th>
                <th scope="col" data-numerico>Pontos</th>
              </tr>
            </thead>
            <tbody>
              {itens.data.items.map((i) => (
                <tr key={i.lancamento_id}>
                  <td>
                    <Link to={i.acao_id ? `/acoes/${i.acao_id}` : `/planos/${i.plano_id}`}>
                      {i.plano_codigo}
                      {i.acao_codigo ? ` · Ação ${i.acao_codigo}` : ""}
                    </Link>
                    <span className={styles.meta}>{i.acao_descricao ?? i.plano_nome}</span>
                  </td>
                  <td>{formatarDataHora(i.concluido_em)}</td>
                  {categoria === "executor" && <td>{i.prazo ? formatarData(i.prazo) : "—"}</td>}
                  <td>
                    {ROTULO_CLASSIFICACAO[i.classificacao]}
                    <span className={styles.meta}>
                      {i.regra} · lançamento #{i.lancamento_id}
                    </span>
                  </td>
                  <td data-numerico>{i.pontos}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Drawer>
  );
}
