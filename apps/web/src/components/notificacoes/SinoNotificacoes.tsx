import type { NotificacaoItem } from "@planogestao/shared-types";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useContagemNotificacoes, useListaNotificacoes, useMarcarLida, useMarcarTodas } from "../../hooks/useNotificacoes";
import { formatarRelativo } from "../../utils/datas";
import { infoTipo, linkDaNotificacao } from "../../utils/notificacoes";
import { Button, ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./Notificacoes.module.css";

const RECENTES = 8;

export function SinoNotificacoes() {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const contagem = useContagemNotificacoes();
  const naoLidas = contagem.data?.nao_lidas ?? 0;
  // A lista só é buscada com o painel aberto (e atualizada quando a contagem sobe).
  const recentes = useListaNotificacoes({ page_size: RECENTES }, aberto);
  const marcarLida = useMarcarLida();
  const marcarTodas = useMarcarTodas();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const abrir = (n: NotificacaoItem) => {
    if (!n.lida) marcarLida.mutate(n.id);
    const link = linkDaNotificacao(n);
    setAberto(false);
    if (link) navigate(link);
  };

  return (
    <div className={styles.sino} ref={raiz}>
      <button
        type="button"
        className={styles.botaoSino}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={naoLidas ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="bell" size={18} />
        {naoLidas > 0 && (
          <span className={styles.contador} aria-hidden="true">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className={styles.painel} role="dialog" aria-label="Notificações recentes">
          <header className={styles.cabecalhoPainel}>
            <strong>Notificações</strong>
            {naoLidas > 0 && (
              <Button variante="link" tamanho="sm" onClick={() => marcarTodas.mutate(undefined)} disabled={marcarTodas.isPending}>
                Marcar todas como lidas
              </Button>
            )}
          </header>

          {recentes.isLoading && <p className={styles.vazio}>Carregando…</p>}
          {recentes.data && recentes.data.items.length === 0 && <p className={styles.vazio}>Nenhuma notificação.</p>}
          {recentes.data && recentes.data.items.length > 0 && (
            <ul className={styles.listaPainel}>
              {recentes.data.items.map((n) => {
                const t = infoTipo(n.tipo);
                return (
                  <li key={n.id}>
                    <button type="button" className={n.lida ? styles.itemPainel : `${styles.itemPainel} ${styles.naoLida}`} onClick={() => abrir(n)}>
                      <span className={styles.icone} style={{ color: `var(${t.corToken})`, background: `color-mix(in oklab, var(${t.corToken}) 14%, transparent)` }} aria-hidden="true">
                        <Icon name={t.icone} size={16} />
                      </span>
                      <span className={styles.textoItem}>
                        <span className={styles.tituloItem}>{n.titulo}</span>
                        <span className={styles.mensagemItem}>{n.mensagem}</span>
                        <span className={styles.meta}>
                          {t.rotulo} · {formatarRelativo(n.criado_em)}
                          {!n.lida && " · não lida"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className={styles.rodapePainel}>
            <ButtonLink to="/notificacoes" variante="link" onClick={() => setAberto(false)}>
              Ver todas
            </ButtonLink>
          </footer>
        </div>
      )}
    </div>
  );
}
