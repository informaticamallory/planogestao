import type { OrdenacaoPlano, PlanoListaItem } from "@planogestao/shared-types";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatarData, formatarDataDoInstante } from "../../utils/datas";
import { ROTULO_PRIORIDADE } from "../../utils/rotulos";
import { Badge, BadgeGroup } from "../ui/Badge";
import { ProgressBar } from "../ui/ProgressBar";
import { PlanStatusBadge, PrazoTag } from "../ui/StatusBadges";
import styles from "./TabelaPlanos.module.css";

export interface ColunaPlano {
  id: string;
  titulo: string;
  ordenacao?: OrdenacaoPlano;
  visivelPorPadrao: boolean;
  /** Colunas fixas não podem ser ocultadas. */
  fixa?: boolean;
  classe?: string;
  render: (p: PlanoListaItem) => ReactNode;
}

export const COLUNAS_PLANOS: ColunaPlano[] = [
  {
    id: "codigo",
    titulo: "Código",
    ordenacao: "codigo",
    visivelPorPadrao: true,
    fixa: true,
    classe: styles.colunaCodigo,
    // Link real na célula: permite abrir em nova aba e navegar pelo teclado.
    render: (p) => (
      <Link to={`/planos/${p.id}`} className={styles.linkCodigo} onClick={(e) => e.stopPropagation()}>
        {p.codigo}
      </Link>
    ),
  },
  {
    id: "nome",
    titulo: "Nome",
    ordenacao: "nome",
    visivelPorPadrao: true,
    fixa: true,
    classe: styles.colunaNome,
    render: (p) => (
      <span className={styles.nome}>
        {p.nome}
        {p.arquivado && <Badge>Arquivado</Badge>}
      </span>
    ),
  },
  { id: "responsavel", titulo: "Responsável", ordenacao: "responsavel", visivelPorPadrao: true, render: (p) => p.responsavel.nome },
  { id: "area", titulo: "Área", ordenacao: "area", visivelPorPadrao: true, render: (p) => p.area.nome },
  { id: "setor", titulo: "Função/Cargo", visivelPorPadrao: false, render: (p) => p.setor?.nome ?? "—" },
  { id: "tipo", titulo: "Tipo", visivelPorPadrao: false, render: (p) => p.tipo.nome },
  { id: "origem", titulo: "Origem", visivelPorPadrao: false, render: (p) => p.origem.nome },
  {
    id: "prioridade",
    titulo: "Prioridade",
    ordenacao: "prioridade",
    visivelPorPadrao: true,
    render: (p) => (
      <span className={p.prioridade === "critica" ? styles.prioridadeCritica : undefined}>{ROTULO_PRIORIDADE[p.prioridade]}</span>
    ),
  },
  {
    id: "inicio",
    titulo: "Início estimado",
    ordenacao: "data_inicio_estimado",
    visivelPorPadrao: false,
    classe: styles.colunaData,
    render: (p) => formatarData(p.data_inicio_estimado),
  },
  {
    id: "prazo",
    titulo: "Fim estimado",
    ordenacao: "data_fim_estimado",
    visivelPorPadrao: true,
    classe: styles.colunaData,
    render: (p) => formatarData(p.data_fim_estimado),
  },
  {
    id: "progresso",
    titulo: "Progresso",
    ordenacao: "progresso",
    visivelPorPadrao: true,
    classe: styles.colunaProgresso,
    render: (p) => <ProgressBar valor={p.progresso} rotulo={`Progresso de ${p.codigo}`} />,
  },
  {
    id: "status",
    titulo: "Status",
    ordenacao: "status",
    visivelPorPadrao: true,
    render: (p) => (
      <BadgeGroup>
        <PlanStatusBadge status={p.status} />
        {p.rascunho && <Badge>Rascunho</Badge>}
      </BadgeGroup>
    ),
  },
  {
    // Situação do prazo: coluna própria, independente do status (ex.: Em andamento + Em atraso).
    id: "prazo_tag",
    titulo: "Prazo",
    visivelPorPadrao: true,
    render: (p) => (p.prazo_tag ? <PrazoTag tag={p.prazo_tag} /> : <span className={styles.semTag}>—</span>),
  },
  {
    id: "criado_em",
    titulo: "Criado em",
    ordenacao: "criado_em",
    visivelPorPadrao: false,
    classe: styles.colunaData,
    render: (p) => formatarDataDoInstante(p.criado_em),
  },
];

export const IDS_COLUNAS = COLUNAS_PLANOS.map((c) => c.id);
export const COLUNAS_PADRAO = COLUNAS_PLANOS.filter((c) => c.visivelPorPadrao).map((c) => c.id);
