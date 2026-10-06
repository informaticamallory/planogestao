import type { TipoPeriodo } from "@planogestao/shared-types";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import estilos from "../../components/equipes/Equipes.module.css";
import { Badge } from "../../components/ui/Badge";
import { ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Table } from "../../components/ui/Table";
import { useEquipes } from "../../hooks/useEquipes";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { temPermissao, useAuthStore } from "../../store/authStore";
import { ROTULO_PERIODO } from "../../utils/rotulos";

const TAMANHOS = [20, 50, 100];
// Sem "personalizado" aqui (sem campos de data na listagem); o padrão é o mesmo dos Indicadores.
const PERIODOS: TipoPeriodo[] = (Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).filter((p) => p !== "personalizado");
const idPositivo = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

export function EquipesPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const podeGerenciar = temPermissao(usuario, "equipes:gerenciar");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [busca, setBusca] = useState(q);
  const periodoBruto = params.get("periodo") as TipoPeriodo | null;
  const periodo: TipoPeriodo = periodoBruto && PERIODOS.includes(periodoBruto) ? periodoBruto : "ano";
  const ativoParam = params.get("ativo");
  const consulta = {
    q: q || undefined,
    area_id: idPositivo(params.get("area_id")),
    ativo: ativoParam === "1" ? true : ativoParam === "0" ? false : undefined,
    periodo,
    page: Math.max(1, Number(params.get("page")) || 1),
    page_size: TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20,
  };

  const atualizar = (mudancas: Record<string, string | null>, manterPagina = false) =>
    setParams(
      (atual) => {
        const p = new URLSearchParams(atual);
        for (const [k, v] of Object.entries(mudancas)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        if (!manterPagina) p.delete("page");
        return p;
      },
      { replace: true },
    );

  // Busca com pequena espera, para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => busca !== q && atualizar({ q: busca.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const lista = useEquipes(consulta);
  const areas = useOpcoesPlanos().data?.areas ?? [];
  const dados = lista.data;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Equipes</h1>
          <p className={styles.subtitulo}>
            Grupos de trabalho com supervisor e membros. O desempenho é o % de ações no prazo das ações cujo responsável é
            membro, no período escolhido — o mesmo cálculo dos Indicadores.
          </p>
        </div>
        {podeGerenciar && (
          <ButtonLink to="/equipes/nova" variante="primaria">
            + Nova equipe
          </ButtonLink>
        )}
      </header>

      <div className={styles.barra}>
        <label className={styles.filtro}>
          Buscar
          <Input compacto type="search" placeholder="Equipe ou supervisor" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className={styles.filtro}>
          Área
          <Select compacto value={consulta.area_id ?? ""} onChange={(e) => atualizar({ area_id: e.target.value || null })}>
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filtro}>
          Situação
          <Select compacto value={ativoParam ?? ""} onChange={(e) => atualizar({ ativo: e.target.value || null })}>
            <option value="">Todas</option>
            <option value="1">Ativas</option>
            <option value="0">Inativas</option>
          </Select>
        </label>
        <label className={styles.filtro}>
          Desempenho no período
          <Select compacto value={periodo} onChange={(e) => atualizar({ periodo: e.target.value === "ano" ? null : e.target.value }, true)}>
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERIODO[p]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <Card semPadding>
        {lista.error ? (
          <p className={styles.erro}>Não foi possível carregar: {lista.error.message}</p>
        ) : !dados ? (
          <p className={styles.estado}>Carregando…</p>
        ) : dados.items.length === 0 ? (
          <p className={styles.estado}>
            {consulta.q || consulta.area_id || consulta.ativo !== undefined ? "Nenhuma equipe com esses filtros." : "Nenhuma equipe cadastrada ainda."}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th scope="col">Equipe</th>
                <th scope="col">Área / Função/Cargo</th>
                <th scope="col">Supervisor</th>
                <th scope="col" data-numerico>
                  Membros
                </th>
                <th scope="col">Desempenho</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.items.map((e) => (
                <tr key={e.id} className={estilos.linha} data-inativo={e.ativo ? undefined : true} onClick={() => navigate(`/equipes/${e.id}`)}>
                  <td>
                    {/* Link real para teclado/leitor de tela; a linha inteira é clicável com o mouse. */}
                    <Link to={`/equipes/${e.id}`} className={estilos.nome} onClick={(ev) => ev.stopPropagation()}>
                      {e.nome}
                    </Link>
                    {e.descricao && <span className={styles.meta}>{e.descricao}</span>}
                  </td>
                  <td>
                    {e.area.nome}
                    {e.setor && <span className={styles.meta}>{e.setor.nome}</span>}
                  </td>
                  <td>{e.supervisor.nome}</td>
                  <td data-numerico>{e.membros}</td>
                  <td>
                    {e.desempenho === null ? (
                      <span className={styles.meta}>Sem ações vencidas ou concluídas</span>
                    ) : (
                      <div className={estilos.desempenho} title="Ações concluídas até o prazo ÷ (concluídas + em atraso)">
                        <div className={estilos.trilho} role="presentation">
                          <div className={estilos.preenchimento} style={{ width: `${e.desempenho}%` }} />
                        </div>
                        <span className={estilos.valor}>{pct(e.desempenho)}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge tom={e.ativo ? "sucesso" : "neutro"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {dados && dados.total > 0 && (
        <Pagination
          pagina={consulta.page}
          tamanho={consulta.page_size}
          total={dados.total}
          tamanhos={TAMANHOS}
          onPagina={(p) => atualizar({ page: String(p) }, true)}
          onTamanho={(t) => atualizar({ page_size: String(t) })}
        />
      )}
    </div>
  );
}
