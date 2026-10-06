import type { PlanoDetalhe } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { useEquipes } from "../../../hooks/useEquipes";
import { SelosEquipe } from "../../../pages/equipes/EquipesPage";
import admin from "../../admin/Admin.module.css";
import estilos from "../../equipes/Equipes.module.css";
import { ButtonLink } from "../../ui/Button";
import { Table } from "../../ui/Table";
import styles from "./AbasPlano.module.css";

/** "Equipes do plano": consulta (as que o usuário pode ver) e criação com o plano já preenchido. */
export function AbaEquipes({ plano }: { plano: PlanoDetalhe }) {
  const lista = useEquipes({ plano_id: plano.id, page_size: 100 });
  const podeCriar = plano.permissoes.gerenciar_equipes;

  return (
    <div className={styles.aba}>
      <div className={admin.cabecalho}>
        <div>
          <h2 className={estilos.tituloSecao}>Equipes do plano</h2>
          <p className={admin.meta}>
            Grupos de trabalho deste plano. Não substituem o gestor do plano nem os responsáveis pelas ações.
            {!podeCriar && " Você vê as equipes que gerencia ou das quais participa."}
          </p>
        </div>
        {podeCriar && (
          <ButtonLink to={`/equipes/nova?plano_id=${plano.id}`} variante="primaria">
            + Nova equipe
          </ButtonLink>
        )}
      </div>
      {lista.error ? (
        <p className={styles.erro}>Não foi possível carregar as equipes: {lista.error.message}</p>
      ) : !lista.data ? (
        <p className={styles.estado}>Carregando…</p>
      ) : lista.data.items.length === 0 ? (
        <p className={styles.estado}>Nenhuma equipe{podeCriar ? " cadastrada neste plano." : " para exibir."}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th scope="col">Equipe</th>
              <th scope="col" className={estilos.colSecundaria}>
                Coordenador
              </th>
              <th scope="col" data-numerico>
                Participantes
              </th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.data.items.map((e) => (
              <tr key={e.id} data-inativo={e.ativo ? undefined : true}>
                <td>
                  <Link to={`/equipes/${e.id}`} className={estilos.nome}>
                    {e.nome}
                  </Link>
                  <span className={`${admin.meta} ${estilos.metaCelular}`}>Coordenador: {e.coordenador.nome}</span>
                  {e.descricao && <span className={admin.meta}>{e.descricao}</span>}
                </td>
                <td className={estilos.colSecundaria}>{e.coordenador.nome}</td>
                <td data-numerico>{e.total_participantes}</td>
                <td>
                  <SelosEquipe equipe={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
