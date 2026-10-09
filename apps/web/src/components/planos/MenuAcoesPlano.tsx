import type { PlanoListaItem } from "@planogestao/shared-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useExcluirPlano } from "../../hooks/usePlano";
import { useArquivarPlano } from "../../hooks/usePlanos";
import { Icon } from "../ui/Icon";
import { classesDoBotao } from "../ui/Button";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";
import { ConfirmarOperacao } from "./ConfirmarOperacao";

/**
 * Ativo: Ver · Editar · Arquivar · Excluir plano. Arquivado: Ver · Desarquivar · Excluir plano.
 * As opções seguem as permissões que a API calcula para ESTE plano (as mesmas do detalhe: perfil + vínculo +
 * áreas autorizadas); a API confere de novo em cada operação.
 */
export function MenuAcoesPlano({ plano }: { plano: PlanoListaItem }) {
  const navigate = useNavigate();
  const podeEditar = plano.permissoes?.editar ?? false;
  const podeArquivar = plano.permissoes?.arquivar ?? false;
  const podeExcluir = plano.permissoes?.excluir ?? false;
  const arquivar = useArquivarPlano();
  const excluir = useExcluirPlano(plano.id);
  const [excluindo, setExcluindo] = useState(false);

  const alternarArquivamento = (fechar: () => void) => {
    fechar();
    const acao = plano.arquivado ? "desarquivar" : "arquivar";
    const aviso = plano.arquivado
      ? `Desarquivar o PA ${plano.codigo} — ${plano.nome}? Ele volta para a listagem de ativos com o mesmo status, dados e vínculos; ` +
        "a situação de prazo das ações é recalculada pelas datas (ações arquivadas individualmente continuam arquivadas)."
      : `Arquivar o PA ${plano.codigo} — ${plano.nome}? Ele e suas ações saem das listas de ativos, dos indicadores e dos lembretes ` +
        "e ficam somente leitura. Arquivar não conclui o plano. Ações, sub-itens, anexos e histórico são preservados.";
    if (!window.confirm(aviso)) return;
    arquivar.mutate(
      { planoId: plano.id, arquivar: !plano.arquivado },
      { onError: (erro) => window.alert(`Não foi possível ${acao}: ${erro.message}`) },
    );
  };

  return (
    <>
      <DropdownMenu rotulo={<Icon name="more" size={18} strokeWidth={2.6} />} ariaLabel={`Ações do plano ${plano.codigo}`} classeBotao={classesDoBotao({ variante: "icone", tamanho: "sm" })}>
        {(fechar) => (
          <>
            <DropdownItem onClick={() => navigate(`/planos/${plano.id}`)}>Ver</DropdownItem>
            {/* Arquivado é somente leitura: a API não devolve "editar" para ele. */}
            {podeEditar && <DropdownItem onClick={() => navigate(`/planos/${plano.id}/editar`)}>Editar</DropdownItem>}
            {podeArquivar && (
              <DropdownItem onClick={() => alternarArquivamento(fechar)} disabled={arquivar.isPending}>
                {plano.arquivado ? "Desarquivar" : "Arquivar"}
              </DropdownItem>
            )}
            {podeExcluir && (
              <DropdownItem
                perigo
                onClick={() => {
                  fechar();
                  excluir.reset();
                  setExcluindo(true);
                }}
              >
                Excluir plano
              </DropdownItem>
            )}
          </>
        )}
      </DropdownMenu>

      <ConfirmarOperacao
        aberto={excluindo}
        titulo="Excluir plano?"
        identificacao={`${plano.codigo} — ${plano.nome}`}
        rotuloBotao="Excluir plano"
        destrutiva
        pendente={excluir.isPending}
        erro={excluir.error?.message}
        onFechar={() => setExcluindo(false)}
        onConfirmar={() => excluir.mutate(undefined, { onSuccess: () => setExcluindo(false) })}
      >
        <p>
          O plano e todas as suas ações ({plano.total_acoes}) e sub-itens também serão retirados das consultas comuns: listas, Minhas Ações,
          calendário, dashboard, indicadores, relatórios e lembretes.
        </p>
        <p>O histórico e os anexos ficam guardados para auditoria, com quem excluiu e quando. Pontos de apurações já encerradas não mudam.</p>
      </ConfirmarOperacao>
    </>
  );
}
