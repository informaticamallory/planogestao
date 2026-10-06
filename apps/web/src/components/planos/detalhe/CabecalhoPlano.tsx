import type { PlanoDetalhe } from "@planogestao/shared-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useArquivamentoPlano, useConcluirPlano, useExcluirPlano } from "../../../hooks/usePlano";
import { formatarData, formatarDataDoInstante } from "../../../utils/datas";
import { Badge } from "../../ui/Badge";
import { Button, ButtonLink } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Modal } from "../../ui/Modal";
import { ConfirmarOperacao } from "../ConfirmarOperacao";
import { PriorityBadge } from "../../ui/StatusBadges";
import { PlanStatusBadge } from "../../ui/StatusBadges";
import styles from "./CabecalhoPlano.module.css";

function descreverPrazo(p: PlanoDetalhe): string {
  if (p.status === "concluido") return formatarData(p.data_fim_estimado);
  if (p.dias_para_prazo < 0) return `${formatarData(p.data_fim_estimado)} · vencido há ${-p.dias_para_prazo} dia(s)`;
  if (p.dias_para_prazo === 0) return `${formatarData(p.data_fim_estimado)} · vence hoje`;
  return `${formatarData(p.data_fim_estimado)} · faltam ${p.dias_para_prazo} dia(s)`;
}

export function CabecalhoPlano({ plano }: { plano: PlanoDetalhe }) {
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [observacao, setObservacao] = useState("");
  const arquivamento = useArquivamentoPlano(plano.id);
  const excluir = useExcluirPlano(plano.id);
  const concluir = useConcluirPlano(plano.id);
  const arquivado = plano.arquivado_em !== null;

  return (
    <header className={styles.cabecalho}>
      {arquivado && (
        <p className={styles.faixaArquivado} role="status">
          PA arquivado em {formatarDataDoInstante(plano.arquivado_em!)}
          {plano.arquivado_por && ` por ${plano.arquivado_por.nome}`}. Somente leitura: desarquive-o para voltar a editar.
        </p>
      )}
      {plano.apto_conclusao && (
        <p className={styles.faixaApto} role="status">
          Todas as ações válidas estão concluídas (houve ação arquivada ou excluída). O plano não é concluído automaticamente:
          {plano.permissoes.concluir ? " confirme a conclusão se o objetivo foi atingido." : " o responsável pelo plano confirma a conclusão."}
          {plano.permissoes.concluir && (
            <Button
              tamanho="sm"
              variante="primaria"
              onClick={() => {
                concluir.reset();
                setObservacao("");
                setConcluindo(true);
              }}
            >
              Confirmar conclusão
            </Button>
          )}
        </p>
      )}
      {plano.rascunho && !arquivado && (
        <p className={styles.faixaArquivado} role="status">
          Rascunho: os responsáveis ainda não foram avisados. Edite o plano e libere-o quando estiver pronto.
        </p>
      )}

      <div className={styles.linhaTitulo}>
        <div className={styles.identificacao}>
          <span className={styles.codigo}>{plano.codigo}</span>
          <h1 className={styles.nome}>{plano.nome}</h1>
          <div className={styles.selos}>
            <PlanStatusBadge status={plano.status} prazoTag={plano.prazo_tag} />
            {plano.rascunho && <Badge>Rascunho</Badge>}
            {arquivado && <Badge>Arquivado</Badge>}
            <PriorityBadge prioridade={plano.prioridade} />
          </div>
        </div>

        <div className={styles.botoes}>
          {plano.permissoes.editar && <ButtonLink to={`/planos/${plano.id}/editar`}>Editar</ButtonLink>}
          {plano.permissoes.arquivar && (
            <Button onClick={() => setConfirmando(true)}>{arquivado ? "Desarquivar PA" : "Arquivar PA"}</Button>
          )}
          {plano.permissoes.excluir && (
            <Button
              variante="perigo"
              onClick={() => {
                excluir.reset();
                setExcluindo(true);
              }}
            >
              Excluir plano
            </Button>
          )}
        </div>
      </div>

      <dl className={styles.metadados}>
        <div>
          <dt>Responsável</dt>
          <dd>{plano.responsavel.nome}</dd>
        </div>
        <div>
          <dt>Área</dt>
          <dd>
            {plano.area.nome}
            {plano.setor && ` / ${plano.setor.nome}`}
          </dd>
        </div>
        <div>
          <dt>Início estimado</dt>
          <dd className={plano.atrasado_para_iniciar ? styles.prazoVencido : undefined}>{formatarData(plano.data_inicio_estimado)}</dd>
        </div>
        <div>
          <dt>Fim estimado</dt>
          <dd className={plano.prazo_tag === "em_atraso" ? styles.prazoVencido : undefined}>{descreverPrazo(plano)}</dd>
        </div>
      </dl>

      <Modal
        aberto={confirmando}
        titulo={arquivado ? "Desarquivar PA?" : "Arquivar PA?"}
        onFechar={() => setConfirmando(false)}
        acoes={
          <>
            <Button onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button
              variante="primaria"
              disabled={arquivamento.isPending}
              onClick={() => arquivamento.mutate(!arquivado, { onSuccess: () => setConfirmando(false) })}
            >
              {arquivamento.isPending ? "Salvando…" : arquivado ? "Desarquivar" : "Arquivar"}
            </Button>
          </>
        }
      >
        <p>
          {arquivado
            ? `${plano.codigo} volta para a listagem de ativos e para os indicadores, com o mesmo status, dados e vínculos. A situação do prazo é recalculada com a data de hoje; ações arquivadas individualmente continuam arquivadas.`
            : `${plano.codigo} e suas ações saem das listas de ativos, dos indicadores e dos lembretes e ficam somente leitura. Arquivar não conclui o plano. Ações, sub-itens, dependências, anexos e histórico são preservados, e dá para desarquivar depois.`}
        </p>
        {arquivamento.isError && <p className={styles.erro}>Não foi possível concluir: {arquivamento.error.message}</p>}
      </Modal>

      <ConfirmarOperacao
        aberto={excluindo}
        titulo="Excluir plano?"
        identificacao={`${plano.codigo} — ${plano.nome}`}
        rotuloBotao="Excluir plano"
        destrutiva
        pendente={excluir.isPending}
        erro={excluir.error?.message}
        onFechar={() => setExcluindo(false)}
        onConfirmar={() => excluir.mutate(undefined, { onSuccess: () => navigate("/planos", { replace: true }) })}
      >
        <p>
          O plano e todas as suas ações ({plano.total_acoes}) e sub-itens também serão retirados das consultas comuns: listas, Minhas Ações,
          calendário, dashboard, indicadores, relatórios e lembretes.
        </p>
        <p>O histórico e os anexos ficam guardados para auditoria, com quem excluiu e quando. Pontos de apurações já encerradas não mudam.</p>
      </ConfirmarOperacao>

      <Modal
        aberto={concluindo}
        titulo="Confirmar conclusão do plano?"
        onFechar={() => setConcluindo(false)}
        acoes={
          <>
            <Button onClick={() => setConcluindo(false)}>Cancelar</Button>
            <Button variante="primaria" disabled={concluir.isPending} onClick={() => concluir.mutate(observacao, { onSuccess: () => setConcluindo(false) })}>
              {concluir.isPending ? "Salvando…" : "Confirmar: objetivo atingido"}
            </Button>
          </>
        }
      >
        <p>
          {plano.codigo} — {plano.nome}: as ações válidas estão concluídas. Ao confirmar, fica registrado que o objetivo foi atingido e o plano
          passa a “Concluído” (com a pontuação do gestor).
        </p>
        <Input aria-label="Observação (opcional)" placeholder="Observação (opcional)" maxLength={180} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        {concluir.isError && <p className={styles.erro}>{concluir.error.message}</p>}
      </Modal>
    </header>
  );
}
