import type { AreaItem, OrigemItem, TipoPlanoItem } from "@planogestao/shared-types";

import styles from "../../components/admin/Admin.module.css";
import { CadastroSimples } from "../../components/admin/CadastroSimples";
import { Checkbox } from "../../components/ui/Input";
import { useAreasAdmin, useOrigensAdmin, useTiposPlanoAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";

export function AreasPage() {
  return (
    <CadastroSimples<AreaItem>
      titulo="Áreas"
      descricao="Áreas da fábrica. Definem a visibilidade dos planos e agrupam funções/cargos e usuários."
      rotulo="área"
      feminino
      consulta={useAreasAdmin()}
      colunas={[
        { titulo: "Funções/Cargos", numerica: true, render: (a) => a.setores },
        { titulo: "Usuários", numerica: true, render: (a) => a.usuarios },
        { titulo: "Planos", numerica: true, render: (a) => a.planos },
      ]}
      salvar={(id, f) => (id ? api.admin.areas.atualizar(id, { nome: f.nome, ativo: f.ativo }) : api.admin.areas.criar({ nome: f.nome, ativo: f.ativo }))}
      excluir={api.admin.areas.excluir}
    />
  );
}

// Funções e Cargos (antiga página Setores): mesma rota e mesmo cadastro, listagem agrupada por área.
export { FuncoesCargosPage as SetoresPage } from "./FuncoesCargosPage";

// As origens marcadas ficam no campo extra como ids separados por vírgula.
const idsDe = (texto: string | undefined) => (texto ? texto.split(",").filter(Boolean).map(Number) : []);

export function TiposPlanoPage() {
  const origens = useOrigensAdmin();

  return (
    <CadastroSimples<TipoPlanoItem>
      titulo="Tipos de Plano"
      descricao="Classificação usada no cadastro e nos filtros de planos. Cada tipo define quais origens fazem sentido para ele: o formulário do plano só oferece essas."
      rotulo="tipo de plano"
      consulta={useTiposPlanoAdmin()}
      colunas={[
        {
          titulo: "Origens compatíveis",
          render: (t) => (t.origens.length ? t.origens.map((o) => o.nome).join(", ") : <span className={styles.meta}>Nenhuma</span>),
        },
        { titulo: "Planos", numerica: true, render: (t) => t.planos },
      ]}
      extraInicial={(t) => ({ origem_ids: (t?.origens ?? []).map((o) => o.id).join(",") })}
      camposExtras={(f, mudar) => {
        const marcadas = new Set(idsDe(f.extra.origem_ids));
        const alternar = (id: number) => {
          const nova = new Set(marcadas);
          if (!nova.delete(id)) nova.add(id);
          mudar("origem_ids", [...nova].join(","));
        };
        return (
          <fieldset className={`${styles.largo} ${styles.grupoOrigens}`}>
            <legend>Origens compatíveis com este tipo</legend>
            {origens.isLoading && <p className={styles.meta}>Carregando…</p>}
            {origens.data?.length === 0 && <p className={styles.meta}>Nenhuma origem cadastrada. Cadastre em Administração › Origens.</p>}
            {origens.data
              ?.filter((o) => o.ativo || marcadas.has(o.id))
              .map((o) => (
                <Checkbox
                  key={o.id}
                  rotulo={o.ativo ? o.nome : `${o.nome} (inativa)`}
                  checked={marcadas.has(o.id)}
                  onChange={() => alternar(o.id)}
                />
              ))}
            <p className={styles.meta}>Planos já cadastrados não mudam: a regra vale para novos planos e para trocas de tipo/origem.</p>
          </fieldset>
        );
      }}
      salvar={async (id, f) => {
        const corpo = { nome: f.nome, ativo: f.ativo };
        const tipo = id ? await api.admin.tiposPlano.atualizar(id, corpo) : await api.admin.tiposPlano.criar(corpo);
        return api.admin.tiposPlano.definirOrigens(tipo.id, idsDe(f.extra.origem_ids));
      }}
      excluir={api.admin.tiposPlano.excluir}
    />
  );
}

export function OrigensPage() {
  return (
    <CadastroSimples<OrigemItem>
      titulo="Origens"
      descricao="De onde veio a necessidade do plano (ex.: auditoria interna, reclamação de cliente, kaizen). Quais origens valem para cada tipo é definido em Tipos de Plano."
      rotulo="origem"
      feminino
      consulta={useOrigensAdmin()}
      colunas={[
        {
          titulo: "Tipos de plano",
          render: (o) => (o.tipos.length ? o.tipos.map((t) => t.nome).join(", ") : <span className={styles.meta}>Nenhum (não aparece no formulário)</span>),
        },
        { titulo: "Planos", numerica: true, render: (o) => o.planos },
      ]}
      salvar={(id, f) => (id ? api.admin.origens.atualizar(id, { nome: f.nome, ativo: f.ativo }) : api.admin.origens.criar({ nome: f.nome, ativo: f.ativo }))}
      excluir={api.admin.origens.excluir}
    />
  );
}
