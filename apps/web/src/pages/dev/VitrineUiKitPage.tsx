/**
 * Vitrine dos componentes de src/components/ui (somente em desenvolvimento, fora do login).
 * Serve para conferir o Mallory Design System nos dois temas e nas três densidades.
 * Os textos são exemplos de componente, não dados do sistema; a rota não existe no build de produção.
 */
import { useState } from "react";

import { ControlesAparencia } from "../../components/layout/ControlesAparencia";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Icon, NOMES_ICONES } from "../../components/ui/Icon";
import { Checkbox, Input, Textarea } from "../../components/ui/Input";
import { KpiCard } from "../../components/ui/KpiCard";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Select } from "../../components/ui/Select";
import { ActionStatusBadge, DeadlineStatusLabel, PlanStatusBadge, PriorityBadge } from "../../components/ui/StatusBadges";
import { Table } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import styles from "./VitrineUiKitPage.module.css";

const STATUS_ACAO = ["aguardando_aceite", "aceita", "em_andamento", "bloqueada", "concluida", "recusada", "cancelada"] as const;
const CORES_DADOS = ["--cor-dado-em-andamento", "--cor-dado-atrasada", "--cor-dado-concluida", "--cor-dado-pendente", "--cor-dado-vencendo", "--cor-dado-neutro"];

export function VitrineUiKitPage() {
  const [aba, setAba] = useState<"a" | "b" | "c">("a");
  const [modal, setModal] = useState(false);
  const [pagina, setPagina] = useState(2);

  return (
    <div className={styles.vitrine}>
      <header className={styles.topo}>
        <div>
          <h1 className={styles.titulo}>UI Kit — PlanoGestão</h1>
          <p className={styles.sub}>Mallory Design System · componentes de src/components/ui · somente desenvolvimento</p>
        </div>
        <ControlesAparencia />
      </header>

      <Card titulo="Button">
        <div className={styles.linha}>
          <Button variante="primaria"><Icon name="plus" size={16} />Novo plano</Button>
          <Button><Icon name="filter" size={16} />Filtros</Button>
          <Button variante="perigo"><Icon name="x" size={15} />Cancelar</Button>
          <Button variante="link">Ver todas</Button>
          <Button variante="icone" aria-label="Configurações"><Icon name="settings" size={17} /></Button>
          <Button variante="primaria" disabled>Desabilitado</Button>
        </div>
        <div className={styles.linha}>
          <Button variante="primaria" tamanho="sm"><Icon name="check" size={14} />Aprovar</Button>
          <Button tamanho="sm"><Icon name="refresh" size={14} />Atualizar</Button>
          <Button tamanho="sm"><Icon name="arrowUpRight" size={14} />Abrir</Button>
          <Button variante="icone" tamanho="sm" aria-label="Mais ações"><Icon name="more" size={16} /></Button>
        </div>
      </Card>

      <Card titulo="Badge e status">
        <div className={styles.linha}>
          <Badge>Rascunho</Badge>
          <Badge tom="primaria">Destaque</Badge>
          <Badge tom="sucesso" ponto>Ativo</Badge>
          <Badge tom="aviso" ponto>Aguardando</Badge>
          <Badge tom="erro" ponto>Em atraso</Badge>
          <Badge tom="info">Fixo</Badge>
          <Badge tom="sucesso" tamanho="sm">sm</Badge>
        </div>
        <div className={styles.linha}>
          {STATUS_ACAO.map((s) => (
            <ActionStatusBadge key={s} status={s} />
          ))}
          <ActionStatusBadge status="em_andamento" prazoTag="em_atraso" />
        </div>
        <div className={styles.linha}>
          <PlanStatusBadge status="nao_iniciado" prazoTag="no_prazo" />
          <PlanStatusBadge status="em_andamento" prazoTag="a_vencer" />
          <PlanStatusBadge status="em_andamento" prazoTag="em_atraso" />
          <PlanStatusBadge status="nao_iniciado" prazoTag="sem_prazo" />
          <PlanStatusBadge status="concluido" prazoTag={null} />
          <PriorityBadge prioridade="critica" />
          <PriorityBadge prioridade="media" />
        </div>
        <div className={styles.linha}>
          <DeadlineStatusLabel situacao="atrasada" />
          <DeadlineStatusLabel situacao="vencendo" />
          <DeadlineStatusLabel situacao="em_andamento" />
          <DeadlineStatusLabel situacao="concluida" />
        </div>
      </Card>

      <div className={styles.kpis}>
        <KpiCard valor="48" rotulo="Planos em andamento" dica="no período" tom="primaria" serie={[12, 18, 15, 22, 19, 26, 24]} />
        <KpiCard valor="6" rotulo="A vencer" dica="próximos 3 dias" tom="aviso" variacao={-12} />
        <KpiCard valor="87,5" sufixo="%" rotulo="No prazo" dica="entregas" tom="sucesso" variacao={8} />
        <KpiCard valor="3" rotulo="Em atraso" dica="em aberto" tom="erro" serie={[2, 1, 3, 2, 4, 3, 3]} />
      </div>

      <Card titulo="Formulário">
        <div className={styles.form}>
          <Field id="v-busca" rotulo="Buscar">
            <Input id="v-busca" type="search" placeholder="Código ou nome do plano…" />
          </Field>
          <Field id="v-nome" rotulo="Nome do plano" obrigatorio ajuda="Como o plano aparece nas listagens.">
            <Input id="v-nome" placeholder="Redução de refugo na linha 3" />
          </Field>
          <Field id="v-erro" rotulo="Prazo" erro="O prazo não pode ser anterior à abertura.">
            <Input {...fieldAria("v-erro", "x")} type="date" />
          </Field>
          <Field id="v-bloq" rotulo="Bloqueado">
            <Input id="v-bloq" placeholder="Somente leitura" disabled />
          </Field>
          <Field id="v-sel" rotulo="Prioridade" ajuda="Define a ordem na fila.">
            <Select id="v-sel">
              <option>Crítica</option>
              <option>Alta</option>
              <option>Média</option>
              <option>Baixa</option>
            </Select>
          </Field>
          <Field id="v-aviso" rotulo="Prazo da ação" aviso="Posterior ao prazo geral do plano.">
            <Input id="v-aviso" type="date" />
          </Field>
          <Field id="v-txt" rotulo="Observação" className={styles.largo}>
            <Textarea id="v-txt" placeholder="Detalhes…" />
          </Field>
          <Checkbox rotulo="Somente não lidas" defaultChecked />
          <Checkbox rotulo="Desabilitado" disabled />
        </div>
      </Card>

      <Card titulo="Tabs, Table, ProgressBar" semPadding acoes={<Badge>3 ações</Badge>}>
        <div className={styles.miolo}>
          <Tabs
            rotulo="Exemplo"
            ativa={aba}
            onSelecionar={setAba}
            abas={[
              { id: "a", rotulo: "Em aberto", contador: 3 },
              { id: "b", rotulo: "Concluídas" },
              { id: "c", rotulo: "Em atraso", contador: 1 },
            ]}
          >
            <Table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ação</th>
                  <th>Status</th>
                  <th>Progresso</th>
                  <th data-numerico>Dias</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={styles.mono}>PA-2026-0012</td>
                  <td>Revisar instrução de trabalho</td>
                  <td><ActionStatusBadge status="em_andamento" prazoTag="no_prazo" /></td>
                  <td><ProgressBar valor={62.5} rotulo="Progresso" /></td>
                  <td data-numerico>4</td>
                </tr>
                <tr>
                  <td className={styles.mono}>PA-2026-0011</td>
                  <td>Treinar operadores do turno B</td>
                  <td><ActionStatusBadge status="aguardando_aceite" prazoTag="em_atraso" /></td>
                  <td><ProgressBar valor={0} rotulo="Progresso" /></td>
                  <td data-numerico>—</td>
                </tr>
                <tr data-inativo>
                  <td className={styles.mono}>PA-2026-0009</td>
                  <td>Linha inativa</td>
                  <td><ActionStatusBadge status="cancelada" /></td>
                  <td><ProgressBar valor={100} rotulo="Progresso" corToken="--success" /></td>
                  <td data-numerico>0</td>
                </tr>
              </tbody>
            </Table>
          </Tabs>
          <Pagination pagina={pagina} tamanho={10} total={87} tamanhos={[10, 20, 50]} onPagina={setPagina} onTamanho={() => undefined} />
        </div>
      </Card>

      <div className={styles.duas}>
        <Card titulo="Avatar">
          <div className={styles.linha}>
            <Avatar nome="Maria Santos" tamanho="sm" />
            <Avatar nome="João Silva" />
            <Avatar nome="Carlos Lima" tamanho="lg" />
            <Avatar nome="Fernanda Rocha" tamanho="xl" />
          </div>
        </Card>
        <Card titulo="Modal e cores de dados" acoes={<Button tamanho="sm" onClick={() => setModal(true)}>Abrir modal</Button>}>
          <div className={styles.linha}>
            {CORES_DADOS.map((t) => (
              <span key={t} className={styles.amostra} style={{ background: `var(${t})` }} title={t} />
            ))}
          </div>
        </Card>
      </div>

      <Card titulo={`Ícones (${NOMES_ICONES.length})`}>
        <div className={styles.icones}>
          {NOMES_ICONES.map((n) => (
            <div key={n} className={styles.icone}>
              <Icon name={n} size={20} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        aberto={modal}
        titulo="Excluir área"
        onFechar={() => setModal(false)}
        acoes={
          <>
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button variante="perigo" onClick={() => setModal(false)}>Excluir definitivamente</Button>
          </>
        }
      >
        <p>Só é possível excluir se não estiver em uso; caso esteja, inative para preservar o histórico.</p>
      </Modal>
    </div>
  );
}
