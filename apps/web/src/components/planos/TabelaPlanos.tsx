import type { OrdenacaoPlano, PlanoListaItem } from "@planogestao/shared-types";
import { useNavigate } from "react-router-dom";

import { Icon } from "../ui/Icon";
import { Card } from "../ui/Card";
import { Table } from "../ui/Table";
import type { ColunaPlano } from "./colunasPlanos";
import { MenuAcoesPlano } from "./MenuAcoesPlano";
import styles from "./TabelaPlanos.module.css";

interface TabelaPlanosProps {
  planos: PlanoListaItem[];
  colunas: ColunaPlano[];
  ordenar: OrdenacaoPlano;
  direcao: "asc" | "desc";
  onOrdenar: (campo: OrdenacaoPlano) => void;
}

export function TabelaPlanos({ planos, colunas, ordenar, direcao, onOrdenar }: TabelaPlanosProps) {
  const navigate = useNavigate();

  return (
    <Card semPadding>
      <Table className={styles.tabela}>
        <thead>
          <tr>
            {colunas.map((c) => {
              const ativa = c.ordenacao === ordenar;
              return (
                <th
                  key={c.id}
                  className={c.classe}
                  scope="col"
                  aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.ordenacao ? (
                    <button type="button" className={styles.botaoOrdenar} onClick={() => onOrdenar(c.ordenacao!)}>
                      {c.titulo}
                      <span className={styles.indicadorOrdem} aria-hidden="true">
                        {ativa && <Icon name={direcao === "asc" ? "chevronUp" : "chevronDown"} size={13} strokeWidth={2.4} />}
                      </span>
                    </button>
                  ) : (
                    c.titulo
                  )}
                </th>
              );
            })}
            <th className={styles.colunaAcoes} scope="col" data-acoes>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {planos.map((p) => (
            <tr key={p.id} className={styles.linha} onClick={() => navigate(`/planos/${p.id}`)}>
              {colunas.map((c) => (
                <td key={c.id} className={c.classe}>
                  {c.render(p)}
                </td>
              ))}
              <td className={styles.colunaAcoes} data-acoes>
                <MenuAcoesPlano plano={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
