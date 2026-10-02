import { useParams } from "react-router-dom";

import { DetalheAcao } from "../../components/acoes/DetalheAcao";

export function AcaoDetalhePage() {
  return <DetalheAcao acaoId={Number(useParams().id)} />;
}
