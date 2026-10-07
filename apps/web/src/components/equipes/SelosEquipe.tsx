import type { EquipeItem } from "@planogestao/shared-types";

import { Badge } from "../ui/Badge";
import estilos from "./Equipes.module.css";

/** Situação da equipe (e se está sem plano ou com o plano arquivado). */
export function SelosEquipe({ equipe }: { equipe: Pick<EquipeItem, "ativo" | "plano"> }) {
  return (
    <span className={estilos.selos}>
      <Badge tom={equipe.ativo ? "sucesso" : "neutro"}>{equipe.ativo ? "Ativa" : "Inativa"}</Badge>
      {!equipe.plano && <Badge tom="aviso">Sem plano vinculado</Badge>}
      {equipe.plano?.arquivado && <Badge tom="neutro">Plano arquivado</Badge>}
    </span>
  );
}
