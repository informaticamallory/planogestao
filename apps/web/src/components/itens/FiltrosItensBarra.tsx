import type { FiltrosItens } from "@planogestao/api-client";
import type { TipoPeriodo } from "@planogestao/shared-types";

import { usePlanos } from "../../hooks/usePlanos";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { ROTULO_PERIODO, ROTULO_PRAZO } from "../../utils/rotulos";
import { Button } from "../ui/Button";
import { CampoData, CampoSelect, GrupoOpcoes, idOuUndefined, lista } from "../relatorios/CamposFiltro";
import rel from "../relatorios/Relatorios.module.css";
import estilos from "../../pages/itens/Itens.module.css";

export const ROTULO_GRUPO_STATUS = { nao_iniciado: "Não iniciado", em_andamento: "Em andamento", concluido: "Concluído" } as const;
const PRAZOS = ["em_atraso", "a_vencer", "no_prazo", "sem_prazo"] as const;

interface Props {
  filtros: FiltrosItens;
  onAlterar: (parcial: Record<string, unknown>) => void;
  onLimpar: () => void;
  /** Listagem: mostra também o filtro de nível (ação principal / subação). */
  comNivel?: boolean;
}

/**
 * Filtros da listagem de itens (ações e sub-itens), espelhados na URL.
 * Área/função-cargo/responsável/status/prazo são do ITEM; o período usa a data escolhida em "Data do período".
 */
export function FiltrosItensBarra({ filtros: f, onAlterar, onLimpar, comNivel = false }: Props) {
  const opcoes = useOpcoesPlanos().data;
  const planos = usePlanos({ page_size: 100, ordenar: "codigo", direcao: "asc", arquivados: f.arquivados ?? "excluir" }).data?.items ?? [];
  const setores = (opcoes?.setores ?? []).filter((s) => !f.area_id || s.area_id === f.area_id);

  return (
    <div className={estilos.filtros}>
      <div className={rel.linhaFiltros}>
        <CampoSelect
          rotulo="PA"
          vazio="Todos"
          valor={f.plano_id ?? undefined}
          onAlterar={(v) => onAlterar({ plano_id: idOuUndefined(v) })}
          opcoes={planos.map((p) => ({ valor: p.id, rotulo: `${p.codigo} — ${p.nome}` }))}
        />
        <CampoSelect
          rotulo="Responsável (do item)"
          vazio="Todos"
          valor={f.responsavel_id ?? undefined}
          onAlterar={(v) => onAlterar({ responsavel_id: idOuUndefined(v) })}
          opcoes={(opcoes?.responsaveis ?? []).map((u) => ({ valor: u.id, rotulo: u.nome }))}
        />
        <CampoSelect
          rotulo="Área (do item)"
          vazio="Todas"
          valor={f.area_id ?? undefined}
          onAlterar={(v) => onAlterar({ area_id: idOuUndefined(v), setor_id: undefined })}
          opcoes={(opcoes?.areas ?? []).map((a) => ({ valor: a.id, rotulo: a.nome }))}
        />
        <CampoSelect
          rotulo="Função/Cargo (do item)"
          vazio="Todas"
          valor={f.setor_id ?? undefined}
          onAlterar={(v) => onAlterar({ setor_id: idOuUndefined(v) })}
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.nome }))}
        />
        {comNivel && (
          <CampoSelect
            rotulo="Nível"
            vazio="Ações e sub-itens"
            valor={f.nivel ?? undefined}
            onAlterar={(v) => onAlterar({ nivel: v || undefined })}
            opcoes={[
              { valor: "principal", rotulo: "Só ações principais" },
              { valor: "subacao", rotulo: "Só sub-itens (todos os níveis)" },
            ]}
          />
        )}
        <CampoSelect
          rotulo="Exibição"
          vazio="PAs ativos"
          valor={f.arquivados === "excluir" ? undefined : (f.arquivados ?? undefined)}
          onAlterar={(v) => onAlterar({ arquivados: v || undefined })}
          opcoes={[
            { valor: "somente", rotulo: "PAs arquivados" },
            { valor: "incluir", rotulo: "Todos os PAs" },
          ]}
        />
      </div>
      <div className={rel.linhaFiltros}>
        <CampoSelect
          rotulo="Período"
          vazio="Qualquer data"
          valor={f.periodo ?? undefined}
          onAlterar={(v) => onAlterar({ periodo: v || undefined })}
          opcoes={(Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => ({ valor: p, rotulo: ROTULO_PERIODO[p] }))}
        />
        {f.periodo === "personalizado" && (
          <>
            <CampoData rotulo="De" valor={f.data_inicio ?? undefined} max={f.data_fim ?? undefined} onAlterar={(v) => onAlterar({ data_inicio: v })} />
            <CampoData rotulo="Até" valor={f.data_fim ?? undefined} min={f.data_inicio ?? undefined} onAlterar={(v) => onAlterar({ data_fim: v })} />
          </>
        )}
        {/* Deixa explícito qual data o período usa. */}
        <CampoSelect
          rotulo="Data do período"
          vazio="Criação do item"
          valor={f.campo_data === "prazo" ? "prazo" : undefined}
          onAlterar={(v) => onAlterar({ campo_data: v || undefined })}
          opcoes={[{ valor: "prazo", rotulo: "Prazo de conclusão do item" }]}
        />
        <GrupoOpcoes
          rotulo="Status"
          valores={lista(f.status)}
          onAlterar={(v) => onAlterar({ status: v })}
          opcoes={(Object.keys(ROTULO_GRUPO_STATUS) as (keyof typeof ROTULO_GRUPO_STATUS)[]).map((s) => ({ valor: s, rotulo: ROTULO_GRUPO_STATUS[s] }))}
        />
        <GrupoOpcoes
          rotulo="Situação do prazo"
          valores={lista(f.prazo)}
          onAlterar={(v) => onAlterar({ prazo: v })}
          opcoes={PRAZOS.map((t) => ({ valor: t, rotulo: ROTULO_PRAZO[t] }))}
        />
        <Button variante="link" onClick={onLimpar}>
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}
