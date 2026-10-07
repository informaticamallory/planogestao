import { ApiError } from "@planogestao/api-client";
import type { AcaoDetalhe } from "@planogestao/shared-types";
import { Link } from "react-router-dom";

import { useAcaoDetalhe } from "../../hooks/useAcao";
import { formatarData, formatarDataHora } from "../../utils/datas";
import { ROTULO_LISTA_PLANOS, caminhoListaPlanos } from "../../utils/hierarquiaPlanos";
import { NavegacaoHierarquia, type NivelHierarquia } from "../planos/NavegacaoHierarquia";
import { Icon } from "../ui/Icon";
import { ProgressBar } from "../ui/ProgressBar";
import { PriorityBadge, ActionStatusBadge } from "../ui/StatusBadges";
import styles from "./Acao.module.css";
import { BlocoPlanejamento, BlocoReabrir, BlocoSubacoes, FaixaAguardando } from "./BlocosEstrutura";
import { BlocoAceite, BlocoRespostaSolicitacao } from "./BlocosFluxo";
import { FormExecucao } from "./FormExecucao";
import { TimelineAcao } from "./TimelineAcao";

const ROTULO_SOLICITACAO = { pendente: "Pendente", aceita: "Aprovada", recusada: "Recusada" } as const;

function descreverPrazo(a: AcaoDetalhe): string {
  const data = formatarData(a.prazo);
  if (a.status === "concluida" || a.status === "cancelada" || a.status === "recusada") return data;
  if (a.dias_para_prazo < 0) return `${data} · vencido há ${-a.dias_para_prazo} dia(s)`;
  if (a.dias_para_prazo === 0) return `${data} · vence hoje`;
  return `${data} · faltam ${a.dias_para_prazo} dia(s)`;
}

const rotuloItem = (nivel: number, numero: string) => `${nivel === 0 ? "Ação" : "Sub-item"} ${numero}`;

/**
 * Página da ação: caminho Todos os planos → Plano → Ação → Sub-item… pelos vínculos reais (plano e
 * `caminho`, da ação principal ao pai imediato). "Voltar" sobe um nível: o pai, ou o plano (aba Ações) na ação
 * principal; nível sem acesso é pulado (o responsável por um sub-item pode não ver o plano nem os de cima).
 */
function hierarquiaDaAcao(acao: AcaoDetalhe): { niveis: NivelHierarquia[]; voltarPara: string; voltarRotulo: string } {
  const lista = caminhoListaPlanos();
  const doPlano = acao.plano_visivel ? `/planos/${acao.plano.id}?aba=acoes` : undefined;
  const ancestrais = acao.caminho.map((c, i) => ({
    rotulo: rotuloItem(i, c.numero),
    titulo: `${rotuloItem(i, c.numero)} — ${c.descricao}`,
    para: c.acessivel ? `/acoes/${c.id}` : undefined,
  }));
  const niveis: NivelHierarquia[] = [
    { rotulo: ROTULO_LISTA_PLANOS, para: lista },
    { rotulo: acao.plano.codigo, titulo: `${acao.plano.codigo} — ${acao.plano.nome}`, para: doPlano },
    ...ancestrais,
    { rotulo: rotuloItem(acao.caminho.length, acao.numero), titulo: acao.descricao },
  ];
  const acima = [...niveis.slice(0, -1)].reverse().find((n) => n.para);
  return { niveis, voltarPara: acima?.para ?? lista, voltarRotulo: acima?.rotulo ?? ROTULO_LISTA_PLANOS };
}

interface DetalheAcaoProps {
  acaoId: number;
  /** Dentro de um modal: uma coluna só e título h2 (o h1 é da página por trás). */
  compacto?: boolean;
}

/** Conteúdo completo da ação (usado na página /acoes/:id e no modal de Minhas Ações). */
export function DetalheAcao({ acaoId, compacto = false }: DetalheAcaoProps) {
  const { data: acao, error } = useAcaoDetalhe(acaoId);
  const Titulo = compacto ? "h2" : "h1";

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className={styles.pagina}>
        <Titulo>Ação não encontrada</Titulo>
        <p>A ação não existe ou você não tem acesso a ela.</p>
      </div>
    );
  }
  if (error) return <p className={styles.erro}>Não foi possível carregar a ação: {error.message}</p>;
  if (!acao) return <p>Carregando ação…</p>;

  const p = acao.permissoes;
  const mostrarAceite = p.eh_responsavel && acao.status === "aguardando_aceite";

  return (
    <div className={compacto ? `${styles.pagina} ${styles.compacto}` : styles.pagina}>
      <header className={styles.cabecalho}>
        {!compacto && <NavegacaoHierarquia {...hierarquiaDaAcao(acao)} />}
        {/* Modal (Minhas Ações): referência ao plano e caminho de origem como antes. O responsável por uma
            subação pode não ter acesso ao plano: aí o código aparece sem link. */}
        {!compacto ? null : acao.plano_visivel ? (
          <Link to={`/planos/${acao.plano.id}?aba=acoes`} className={styles.migalha}>
            <Icon name="chevronLeft" size={15} />
            {acao.plano.codigo} · {acao.plano.nome}
          </Link>
        ) : (
          <span className={styles.migalha}>
            {acao.plano.codigo} · {acao.plano.nome}
          </span>
        )}
        {compacto && acao.caminho.length > 0 && (
          // Caminho de origem: PA → Ação 1 → Subação 1.1 → … (link só onde o usuário tem acesso).
          <nav className={styles.origem} aria-label="Caminho de origem">
            {acao.plano.codigo}
            {acao.caminho.map((c, i) => {
              const rotulo = `${i === 0 ? "Ação" : "Sub-item"} ${c.numero}`;
              return (
                <span key={c.id}>
                  {" → "}
                  {c.acessivel ? (
                    <Link to={`/acoes/${c.id}`} title={c.descricao}>
                      {rotulo}
                    </Link>
                  ) : (
                    <span title={c.descricao}>{rotulo}</span>
                  )}
                </span>
              );
            })}
            {" → "}
            <strong>Sub-item {acao.numero}</strong>
            {acao.acao_origem && <span className={styles.textoApoio}> · origem imediata: “{acao.acao_origem.descricao}”</span>}
          </nav>
        )}
        <Titulo className={styles.titulo}>
          <span className={styles.numeroTitulo}>
            {acao.acao_origem ? "Sub-item" : "Ação"} {acao.numero}
          </span>
          {acao.descricao}
        </Titulo>
        <div className={styles.selos}>
          <ActionStatusBadge status={acao.status} prazoTag={acao.prazo_tag} arquivo={acao.plano.arquivado ? "plano" : acao.arquivada ? "acao" : null} />
          <PriorityBadge prioridade={acao.prioridade} />
        </div>
        <dl className={styles.metadados}>
          <div>
            <dt>Responsável</dt>
            <dd>{acao.responsavel.nome}</dd>
          </div>
          <div>
            <dt>Área / Função/Cargo</dt>
            <dd>
              {acao.area.nome}
              {acao.setor && ` / ${acao.setor.nome}`}
            </dd>
          </div>
          <div>
            <dt>Início estimado</dt>
            <dd>{acao.prazo_inicio ? formatarData(acao.prazo_inicio) : "—"}</dd>
          </div>
          <div>
            <dt>Prazo de conclusão</dt>
            <dd>{descreverPrazo(acao)}</dd>
          </div>
          <div>
            <dt>Fim estimado do plano</dt>
            <dd>{formatarData(acao.plano.data_fim_estimado)}</dd>
          </div>
          <div className={styles.progressoCabecalho}>
            <dt>Progresso</dt>
            <dd>
              <ProgressBar valor={acao.progresso} rotulo="Progresso da ação" />
            </dd>
          </div>
        </dl>
      </header>

      <FaixaAguardando acao={acao} />
      {p.reabrir && <BlocoReabrir acao={acao} />}
      {acao.status === "cancelada" && acao.motivo_cancelamento && (
        <p className={styles.faixaInfo}>Cancelada: {acao.motivo_cancelamento}</p>
      )}
      {mostrarAceite && <BlocoAceite acao={acao} />}
      {p.responder_solicitacao && <BlocoRespostaSolicitacao acao={acao} />}
      {!mostrarAceite && p.eh_responsavel && acao.solicitacao_pendente && (
        <p className={styles.faixaInfo} role="status">
          Sua solicitação para mudar o prazo para {formatarData(acao.solicitacao_pendente.novo_prazo_sugerido)} aguarda resposta do gestor.
        </p>
      )}

      <div className={styles.grade}>
        <div className={styles.colunaPrincipal}>
          {/* Aguardando aceite, a execução ainda não começou: só o gestor vê (ajustar prazo ou cancelar). */}
          {(acao.status !== "aguardando_aceite" || p.editar_prazo) && <FormExecucao acao={acao} />}
          <BlocoSubacoes acao={acao} />
          <TimelineAcao acaoId={acao.id} />
        </div>

        <aside className={styles.colunaLateral}>
          <BlocoPlanejamento acao={acao} />
          <section className={styles.bloco} aria-labelledby="titulo-datas">
            <h2 id="titulo-datas" className={styles.tituloBloco}>
              Datas reais
            </h2>
            <dl className={styles.listaDatas}>
              <dt>Criada em</dt>
              <dd>
                {formatarDataHora(acao.criado_em)}
                {acao.criado_por && ` por ${acao.criado_por.nome}`}
              </dd>
              {acao.aceita_em && (
                <>
                  <dt>Aceita em</dt>
                  <dd>{formatarDataHora(acao.aceita_em)}</dd>
                </>
              )}
              <dt>Início real</dt>
              <dd>{acao.iniciada_em ? formatarDataHora(acao.iniciada_em) : "Ainda não iniciada"}</dd>
              {acao.concluida_em && (
                <>
                  <dt>Conclusão real</dt>
                  <dd>{formatarDataHora(acao.concluida_em)}</dd>
                </>
              )}
              <dt>Última atualização</dt>
              <dd>{formatarDataHora(acao.atualizado_em)}</dd>
            </dl>
          </section>

          <section className={styles.bloco} aria-labelledby="titulo-solicitacoes">
            <h2 id="titulo-solicitacoes" className={styles.tituloBloco}>
              Solicitações de prazo
            </h2>
            {acao.solicitacoes.length === 0 ? (
              <p className={styles.textoApoio}>Nenhuma solicitação.</p>
            ) : (
              <ul className={styles.listaSolicitacoes}>
                {acao.solicitacoes.map((s) => (
                  <li key={s.id} className={styles.solicitacao}>
                    <span className={styles.statusSolicitacao}>{ROTULO_SOLICITACAO[s.status]}</span>
                    <span>
                      {formatarData(s.prazo_anterior)} → {formatarData(s.novo_prazo_sugerido)}
                    </span>
                    <span className={styles.textoApoio}>
                      {s.solicitado_por.nome}, {formatarDataHora(s.criado_em)}
                    </span>
                    <span className={styles.textoApoio}>“{s.motivo}”</span>
                    {s.respondido_por && (
                      <span className={styles.textoApoio}>
                        Resposta de {s.respondido_por.nome}
                        {s.resposta_justificativa && `: “${s.resposta_justificativa}”`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
