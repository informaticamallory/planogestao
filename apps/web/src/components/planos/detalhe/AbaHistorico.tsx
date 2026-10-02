import type { EventoTimeline } from "@planogestao/shared-types";

import { useHistoricoPlano } from "../../../hooks/usePlano";
import { formatarDataDoInstante, formatarDataHora } from "../../../utils/datas";
import { autorDoEvento, descreverEvento } from "../../../utils/historico";
import { Button } from "../../ui/Button";
import styles from "./AbasPlano.module.css";

const ROTULO_ORIGEM: Record<EventoTimeline["origem"], string> = { plano: "Plano", acao: "Ação", anexo: "Anexo" };

function agruparPorDia(eventos: EventoTimeline[]): [string, EventoTimeline[]][] {
  const grupos = new Map<string, EventoTimeline[]>();
  for (const e of eventos) {
    const dia = formatarDataDoInstante(e.criado_em);
    grupos.set(dia, [...(grupos.get(dia) ?? []), e]);
  }
  return [...grupos];
}

export function AbaHistorico({ planoId }: { planoId: number }) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useHistoricoPlano(planoId);

  if (isLoading) return <p className={styles.estado}>Carregando histórico…</p>;
  if (error || !data) return <p className={styles.erro}>Não foi possível carregar o histórico.</p>;

  const eventos = data.pages.flatMap((p) => p.items);
  const total = data.pages[0]?.total ?? 0;
  if (eventos.length === 0) return <p className={styles.estado}>Nenhum evento registrado.</p>;

  return (
    <div className={styles.aba}>
      <p className={styles.legendaHistorico}>
        {total} evento(s) do plano, das ações e dos anexos — do mais recente ao mais antigo.
      </p>
      <ol className={styles.timeline}>
        {agruparPorDia(eventos).map(([dia, doDia]) => (
          <li key={dia} className={styles.diaTimeline}>
            <h3 className={styles.tituloDia}>{dia}</h3>
            <ol className={styles.eventosDia}>
              {doDia.map((e) => (
                <li key={e.id} className={styles.evento}>
                  <span className={`${styles.origem} ${styles[`origem_${e.origem}`]}`}>{ROTULO_ORIGEM[e.origem]}</span>
                  <p className={styles.fraseEvento}>
                    <strong>{autorDoEvento(e)}</strong> {descreverEvento(e)}
                  </p>
                  <time className={styles.horaEvento} dateTime={e.criado_em} title={formatarDataHora(e.criado_em)}>
                    {new Date(e.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {hasNextPage && (
        <Button className={styles.botaoInicio} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Carregando…" : `Carregar mais (${total - eventos.length} restantes)`}
        </Button>
      )}
    </div>
  );
}
