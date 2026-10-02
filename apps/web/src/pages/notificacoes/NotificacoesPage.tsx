import { Link, useSearchParams } from "react-router-dom";

import styles from "../../components/notificacoes/Notificacoes.module.css";
import { Icon } from "../../components/ui/Icon";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { useListaNotificacoes, useMarcarLida, useMarcarTodas } from "../../hooks/useNotificacoes";
import { formatarDataHora, formatarRelativo } from "../../utils/datas";
import { TIPOS_NOTIFICACAO, infoTipo, linkDaNotificacao } from "../../utils/notificacoes";

const TAMANHOS = [20, 50, 100];

export function NotificacoesPage() {
  const [params, setParams] = useSearchParams();
  const tipo = TIPOS_NOTIFICACAO.some((t) => t.tipo === params.get("tipo")) ? params.get("tipo")! : undefined;
  const somenteNaoLidas = params.get("nao_lidas") === "1";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = TAMANHOS.includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20;

  const lista = useListaNotificacoes({
    tipo: tipo ? [tipo] : undefined,
    lida: somenteNaoLidas ? false : undefined,
    page,
    page_size: pageSize,
  });
  const marcarLida = useMarcarLida();
  const marcarTodas = useMarcarTodas();

  const atualizar = (mudancas: Record<string, string | null>) =>
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      return p;
    });

  const dados = lista.data;

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalhoPagina}>
        <div>
          <h1 className={styles.titulo}>Notificações</h1>
          <p className={styles.subtitulo}>
            {dados ? `${dados.nao_lidas} não lida(s)` : "…"} · atualiza automaticamente a cada 30 segundos
          </p>
        </div>
        <div className={styles.filtros}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Tipo</span>
            <Select compacto className={styles.controleTipo} value={tipo ?? ""} onChange={(e) => atualizar({ tipo: e.target.value || null, page: null })}>
              <option value="">Todos</option>
              {TIPOS_NOTIFICACAO.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.rotulo}
                </option>
              ))}
            </Select>
          </label>
          <Checkbox
            className={styles.opcao}
            rotulo="Somente não lidas"
            checked={somenteNaoLidas}
            onChange={(e) => atualizar({ nao_lidas: e.target.checked ? "1" : null, page: null })}
          />
          <Button
            disabled={!dados?.nao_lidas || marcarTodas.isPending}
            onClick={() => marcarTodas.mutate(tipo ? [tipo] : undefined)}
          >
            {tipo ? "Marcar deste tipo como lidas" : "Marcar todas como lidas"}
          </Button>
        </div>
      </header>

      {lista.error ? (
        <p className={styles.erro}>Não foi possível carregar as notificações: {lista.error.message}</p>
      ) : !dados ? (
        <p className={styles.vazio}>Carregando…</p>
      ) : dados.items.length === 0 ? (
        <p className={styles.vazio}>{tipo || somenteNaoLidas ? "Nenhuma notificação com esses filtros." : "Você não tem notificações."}</p>
      ) : (
        <Card semPadding>
          <ul className={styles.listaPagina}>
            {dados.items.map((n) => {
              const t = infoTipo(n.tipo);
              const link = linkDaNotificacao(n);
              return (
                <li key={n.id} className={n.lida ? styles.itemPagina : `${styles.itemPagina} ${styles.naoLida}`}>
                  <span className={styles.icone} style={{ color: `var(${t.corToken})`, background: `color-mix(in oklab, var(${t.corToken}) 14%, transparent)` }} aria-hidden="true">
                    <Icon name={t.icone} size={16} />
                  </span>
                  <div className={styles.textoItem}>
                    <span className={styles.tituloItem}>
                      {link ? (
                        <Link to={link} onClick={() => !n.lida && marcarLida.mutate(n.id)}>
                          {n.titulo}
                        </Link>
                      ) : (
                        n.titulo
                      )}
                    </span>
                    <span className={styles.mensagemItem}>{n.mensagem}</span>
                    <span className={styles.meta}>
                      {t.rotulo} · <time title={formatarDataHora(n.criado_em)}>{formatarRelativo(n.criado_em)}</time>
                      {n.lida && n.lida_em && ` · lida ${formatarRelativo(n.lida_em)}`}
                    </span>
                  </div>
                  {!n.lida && (
                    <Button onClick={() => marcarLida.mutate(n.id)} disabled={marcarLida.isPending}>
                      Marcar como lida
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {dados && dados.total > 0 && (
        <Pagination
          pagina={page}
          tamanho={pageSize}
          total={dados.total}
          tamanhos={TAMANHOS}
          onPagina={(p) => atualizar({ page: String(p) })}
          onTamanho={(t) => atualizar({ page_size: String(t), page: null })}
        />
      )}
    </div>
  );
}
