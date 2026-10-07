import type { ConfiguracaoItem } from "@planogestao/shared-types";
import { useState } from "react";

import styles from "../../components/admin/Admin.module.css";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { useConfiguracoesAdmin, useMutacaoAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";
import { formatarDataHora } from "../../utils/datas";

export function ConfiguracoesPage() {
  const lista = useConfiguracoesAdmin();
  const grupos = new Map<string, ConfiguracaoItem[]>();
  for (const item of lista.data ?? []) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item]);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Configurações</h1>
          <p className={styles.subtitulo}>
            Parâmetros globais do sistema. Cada alteração vale para todos os usuários em até 30 segundos e fica
            registrada com autor e data.
          </p>
        </div>
      </header>

      {lista.isLoading ? (
        <p className={styles.estado}>Carregando…</p>
      ) : lista.error ? (
        <p className={styles.erro}>Não foi possível carregar: {lista.error.message}</p>
      ) : (
        [...grupos].map(([grupo, itens]) => (
          <Card key={grupo} semPadding className={styles.grupoConfig} aria-labelledby={`grupo-${grupo}`}>
            <h2 id={`grupo-${grupo}`}>{grupo}</h2>
            {itens.map((item) => (
              <LinhaConfiguracao key={item.chave} item={item} />
            ))}
          </Card>
        ))
      )}
    </div>
  );
}

// Dia da semana ISO (1 = segunda) e horário em minutos desde 00:00 (America/Sao_Paulo), como o backend grava.
const DIAS_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
const paraHora = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
const deHora = (texto: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(texto);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
};

function limites(item: ConfiguracaoItem): string {
  if (item.tipo === "dia_semana") return `Padrão: ${DIAS_SEMANA[item.padrao - 1]}.`;
  if (item.tipo === "horario") return `Padrão: ${paraHora(item.padrao)}.`;
  return `Entre ${item.minimo} e ${item.maximo} ${item.unidade}; padrão ${item.padrao}.`;
}

function LinhaConfiguracao({ item }: { item: ConfiguracaoItem }) {
  const [valor, setValor] = useState(item.tipo === "horario" ? paraHora(item.valor) : String(item.valor));
  const [salvo, setSalvo] = useState(false);
  const salvar = useMutacaoAdmin((v: number) => api.admin.configuracoes.atualizar(item.chave, v));

  const numero = item.tipo === "horario" ? deHora(valor) : Number(valor);
  const invalido = valor.trim() === "" || !Number.isInteger(numero) || numero < item.minimo || numero > item.maximo;
  const alterado = !invalido && numero !== item.valor;
  const id = `cfg-${item.chave}`;

  return (
    <div className={styles.linhaConfig}>
      <div>
        <label htmlFor={id}>
          <strong>{item.rotulo}</strong>
        </label>
        <span className={styles.meta} id={`${id}-ajuda`}>
          {item.descricao} {limites(item)}
        </span>
        <span className={styles.meta}>
          {item.atualizado_por
            ? `Alterado por ${item.atualizado_por} em ${formatarDataHora(item.atualizado_em!)}.`
            : "Valor inicial do sistema."}
        </span>
        {salvar.error && <p className={styles.erro}>{salvar.error.message}</p>}
        {salvo && !alterado && (
          <span className={styles.sucesso} role="status">
            Salvo.
          </span>
        )}
      </div>
      <form
        className={styles.controleConfig}
        onSubmit={(e) => {
          e.preventDefault();
          if (!alterado) return;
          salvar.mutate(numero, { onSuccess: () => setSalvo(true) });
        }}
      >
        {item.tipo === "dia_semana" ? (
          <Select
            id={id}
            value={valor}
            aria-describedby={`${id}-ajuda`}
            onChange={(e) => {
              setSalvo(false);
              setValor(e.target.value);
            }}
          >
            {DIAS_SEMANA.map((dia, i) => (
              <option key={dia} value={i + 1}>
                {dia}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            type={item.tipo === "horario" ? "time" : "number"}
            inputMode={item.tipo === "horario" ? undefined : "numeric"}
            min={item.tipo === "horario" ? undefined : item.minimo}
            max={item.tipo === "horario" ? undefined : item.maximo}
            step={item.tipo === "horario" ? 60 : 1}
            value={valor}
            aria-invalid={invalido || undefined}
            aria-describedby={`${id}-ajuda`}
            onChange={(e) => {
              setSalvo(false);
              setValor(e.target.value);
            }}
          />
        )}
        {item.unidade && <span>{item.unidade}</span>}
        <Button type="submit" variante="primaria" disabled={!alterado || salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
