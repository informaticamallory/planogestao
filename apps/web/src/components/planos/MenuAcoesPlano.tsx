import type { PlanoListaItem } from "@planogestao/shared-types";
import { useNavigate } from "react-router-dom";

import { useArquivarPlano } from "../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { Icon } from "../ui/Icon";
import { classesDoBotao } from "../ui/Button";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";

export function MenuAcoesPlano({ plano }: { plano: PlanoListaItem }) {
  const navigate = useNavigate();
  const podeEditar = useAuthStore((s) => temPermissao(s.usuario, "planos:editar"));
  const arquivar = useArquivarPlano();

  const alternarArquivamento = (fechar: () => void) => {
    fechar();
    const acao = plano.arquivado ? "desarquivar" : "arquivar";
    const aviso = plano.arquivado
      ? `Desarquivar o PA ${plano.codigo}? Ele volta para a listagem de ativos com o mesmo status, dados e vínculos.`
      : `Arquivar o PA ${plano.codigo}? Ele sai da listagem de ativos e dos indicadores e fica somente leitura. ` +
        "Ações, sub-itens, dependências, anexos e histórico são preservados.";
    if (!window.confirm(aviso)) return;
    arquivar.mutate(
      { planoId: plano.id, arquivar: !plano.arquivado },
      { onError: (erro) => window.alert(`Não foi possível ${acao}: ${erro.message}`) },
    );
  };

  return (
    <DropdownMenu rotulo={<Icon name="more" size={18} strokeWidth={2.6} />} ariaLabel={`Ações do plano ${plano.codigo}`} classeBotao={classesDoBotao({ variante: "icone", tamanho: "sm" })}>
      {(fechar) => (
        <>
          <DropdownItem onClick={() => navigate(`/planos/${plano.id}`)}>Ver</DropdownItem>
          {podeEditar && (
            <>
              {/* Arquivado é somente leitura: sem "Editar". */}
              {!plano.arquivado && <DropdownItem onClick={() => navigate(`/planos/${plano.id}/editar`)}>Editar</DropdownItem>}
              <DropdownItem onClick={() => alternarArquivamento(fechar)} disabled={arquivar.isPending}>
                {plano.arquivado ? "Desarquivar PA" : "Arquivar PA"}
              </DropdownItem>
            </>
          )}
        </>
      )}
    </DropdownMenu>
  );
}
