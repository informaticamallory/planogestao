import { Link } from "react-router-dom";

import { ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./NavegacaoHierarquia.module.css";

export interface NivelHierarquia {
  rotulo: string;
  /** Texto completo (ex.: descrição da ação) para o title. */
  titulo?: string;
  /** Sem `para`: nível atual, ou sem acesso para abrir. */
  para?: string;
}

/**
 * "← Voltar" + caminho clicável (Todos os planos → Plano → Ação → Sub-item…). O destino do Voltar é o nível
 * acima na hierarquia real, decidido por quem chama; o último nível é a página atual (aria-current).
 */
export function NavegacaoHierarquia({
  niveis,
  voltarPara,
  voltarRotulo,
}: {
  niveis: NivelHierarquia[];
  voltarPara: string;
  voltarRotulo: string;
}) {
  return (
    <div className={styles.navegacao} data-nao-imprimir>
      <ButtonLink to={voltarPara} tamanho="sm" aria-label={`Voltar para ${voltarRotulo}`} className={styles.voltar}>
        <Icon name="arrowLeft" size={16} />
        Voltar
      </ButtonLink>
      <nav aria-label="Caminho" className={styles.caminho}>
        <ol>
          {niveis.map((n, i) => {
            const atual = i === niveis.length - 1;
            return (
              <li key={`${i}-${n.rotulo}`}>
                {atual ? (
                  <span aria-current="page" className={styles.atual} title={n.titulo ?? n.rotulo}>
                    {n.rotulo}
                  </span>
                ) : n.para ? (
                  <Link to={n.para} title={n.titulo ?? n.rotulo}>
                    {n.rotulo}
                  </Link>
                ) : (
                  <span className={styles.semAcesso} title={n.titulo ?? n.rotulo}>
                    {n.rotulo}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
