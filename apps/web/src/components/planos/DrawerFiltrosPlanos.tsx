import type { FiltroArquivados, Prioridade, StatusFiltroPlano, TipoPeriodo } from "@planogestao/shared-types";
import { useEffect, useState } from "react";

import {
  CAMPOS_DRAWER,
  PADRAO,
  PRAZO_FILTRO,
  STATUS_FILTRO,
  periodoCompleto,
  type FiltrosPlanosUrl,
} from "../../hooks/useFiltrosPlanos";
import { useOpcoesPlanos } from "../../hooks/usePlanos";
import { ROTULO_PERIODO, ROTULO_PRAZO, ROTULO_PRIORIDADE, ROTULO_STATUS_PLANO } from "../../utils/rotulos";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Field } from "../ui/Field";
import { Checkbox, Input } from "../ui/Input";
import { Select } from "../ui/Select";
import styles from "./DrawerFiltrosPlanos.module.css";

type Rascunho = Pick<FiltrosPlanosUrl, (typeof CAMPOS_DRAWER)[number]>;

const ROTULO_STATUS_FILTRO: Record<StatusFiltroPlano, string> = ROTULO_STATUS_PLANO;
/** Exibição: arquivado é uma condição à parte, não um status. */
export const ROTULO_EXIBICAO: Record<FiltroArquivados, string> = {
  excluir: "Ativos",
  somente: "Arquivados",
  incluir: "Todos",
};

function extrair(f: FiltrosPlanosUrl): Rascunho {
  return Object.fromEntries(CAMPOS_DRAWER.map((c) => [c, f[c]])) as Rascunho;
}

function alternar<T>(lista: T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item];
}

const idOuNulo = (v: string) => (v ? Number(v) : null);

interface DrawerFiltrosPlanosProps {
  aberto: boolean;
  filtros: FiltrosPlanosUrl;
  onFechar: () => void;
  onAplicar: (rascunho: Rascunho) => void;
}

/** Edita um rascunho local; a URL só muda ao clicar em "Aplicar". */
export function DrawerFiltrosPlanos({ aberto, filtros, onFechar, onAplicar }: DrawerFiltrosPlanosProps) {
  const [r, setR] = useState<Rascunho>(() => extrair(filtros));
  const opcoes = useOpcoesPlanos();

  // Ao abrir, parte sempre do que está aplicado na URL.
  useEffect(() => {
    if (aberto) setR(extrair(filtros));
  }, [aberto, filtros]);

  const mudar = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) => setR((atual) => ({ ...atual, [campo]: valor }));
  const setores = (opcoes.data?.setores ?? []).filter((s) => r.area_id === null || s.area_id === r.area_id);
  const periodoValido = periodoCompleto(r);

  return (
    <Drawer
      aberto={aberto}
      titulo="Filtros"
      onFechar={onFechar}
      rodape={
        <>
          <Button onClick={() => setR(extrair(PADRAO))}>Limpar</Button>
          <Button variante="primaria" onClick={() => onAplicar(r)} disabled={!periodoValido}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className={styles.formulario}>
        <fieldset className={styles.grupo}>
          <legend className={styles.legenda}>Status global</legend>
          {STATUS_FILTRO.map((s) => (
            <Checkbox
              key={s}
              rotulo={ROTULO_STATUS_FILTRO[s]}
              checked={r.status.includes(s)}
              onChange={() => mudar("status", alternar(r.status, s))}
            />
          ))}
          <Checkbox rotulo="Somente rascunhos" checked={r.rascunho} onChange={() => mudar("rascunho", !r.rascunho)} />
        </fieldset>

        <fieldset className={styles.grupo}>
          <legend className={styles.legenda}>Situação do prazo</legend>
          {PRAZO_FILTRO.map((t) => (
            <Checkbox key={t} rotulo={ROTULO_PRAZO[t]} checked={r.prazo.includes(t)} onChange={() => mudar("prazo", alternar(r.prazo, t))} />
          ))}
        </fieldset>

        <fieldset className={styles.grupo}>
          <legend className={styles.legenda}>Prioridade</legend>
          {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
            <Checkbox
              key={p}
              rotulo={ROTULO_PRIORIDADE[p]}
              checked={r.prioridade.includes(p)}
              onChange={() => mudar("prioridade", alternar(r.prioridade, p))}
            />
          ))}
        </fieldset>

        {opcoes.isError && <p className={styles.erro}>Não foi possível carregar as opções de filtro.</p>}

        <Field id="filtro-responsavel" rotulo="Responsável">
          <Select
            id="filtro-responsavel"
            value={r.responsavel_id ?? ""}
            onChange={(e) => mudar("responsavel_id", idOuNulo(e.target.value))}
          >
            <option value="">Todos</option>
            {opcoes.data?.responsaveis.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filtro-area" rotulo="Área">
          <Select
            id="filtro-area"
            value={r.area_id ?? ""}
            onChange={(e) => {
              const area = idOuNulo(e.target.value);
              const setorAindaValido = opcoes.data?.setores.some((s) => s.id === r.setor_id && s.area_id === area);
              setR((atual) => ({ ...atual, area_id: area, setor_id: area === null || setorAindaValido ? atual.setor_id : null }));
            }}
          >
            <option value="">Todas</option>
            {opcoes.data?.areas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filtro-setor" rotulo="Função/Cargo">
          <Select id="filtro-setor" value={r.setor_id ?? ""} onChange={(e) => mudar("setor_id", idOuNulo(e.target.value))}>
            <option value="">Todas</option>
            {setores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filtro-tipo" rotulo="Tipo">
          <Select id="filtro-tipo" value={r.tipo_id ?? ""} onChange={(e) => mudar("tipo_id", idOuNulo(e.target.value))}>
            <option value="">Todos</option>
            {opcoes.data?.tipos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filtro-origem" rotulo="Origem">
          <Select id="filtro-origem" value={r.origem_id ?? ""} onChange={(e) => mudar("origem_id", idOuNulo(e.target.value))}>
            <option value="">Todas</option>
            {opcoes.data?.origens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="filtro-periodo" rotulo="Criado no período">
          <Select
            id="filtro-periodo"
            value={r.periodo ?? ""}
            onChange={(e) => mudar("periodo", (e.target.value || null) as TipoPeriodo | null)}
          >
            <option value="">Qualquer data</option>
            {(Object.keys(ROTULO_PERIODO) as TipoPeriodo[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERIODO[p]}
              </option>
            ))}
          </Select>
        </Field>

        {r.periodo === "personalizado" && (
          <div className={styles.datas}>
            <Field id="filtro-data-inicio" rotulo="De">
              <Input
                id="filtro-data-inicio"
                type="date"
                value={r.data_inicio}
                max={r.data_fim || undefined}
                onChange={(e) => mudar("data_inicio", e.target.value)}
              />
            </Field>
            <Field id="filtro-data-fim" rotulo="Até">
              <Input
                id="filtro-data-fim"
                type="date"
                value={r.data_fim}
                min={r.data_inicio || undefined}
                onChange={(e) => mudar("data_fim", e.target.value)}
              />
            </Field>
            {!periodoValido && <p className={styles.erro}>Informe as duas datas (início até fim).</p>}
          </div>
        )}

        <Field id="filtro-arquivados" rotulo="Exibição">
          <Select
            id="filtro-arquivados"
            value={r.arquivados}
            onChange={(e) => mudar("arquivados", e.target.value as FiltroArquivados)}
          >
            {(Object.keys(ROTULO_EXIBICAO) as FiltroArquivados[]).map((a) => (
              <option key={a} value={a}>
                {ROTULO_EXIBICAO[a]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Drawer>
  );
}
