import { ApiError } from "@planogestao/api-client";
import type { ConfigEmailTela, ModeloTela, PreviaEmail } from "@planogestao/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import adminStyles from "../../components/admin/Admin.module.css";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Drawer } from "../../components/ui/Drawer";
import { Field, fieldAria } from "../../components/ui/Field";
import { Checkbox, Input, Textarea } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Table } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useEmailConfig, useMutacaoAdmin } from "../../hooks/useAdministracao";
import { api } from "../../services/api";
import { formatarDataHora } from "../../utils/datas";
import styles from "./EmailConfig.module.css";

/** "a@x.com, b@y.com" ou um por linha → lista (a validação de verdade é do backend). */
const paraLista = (texto: string) => texto.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const TOKEN = /\{\{(.*?)\}\}/gs;

/** Mesma checagem do backend, para avisar enquanto digita: variáveis fora da lista do modelo. */
function variaveisDesconhecidas(texto: string, permitidas: string[]): string[] {
  const fora = [...texto.matchAll(TOKEN)].map((m) => m[1]!.trim()).filter((n) => !permitidas.includes(n));
  const resto = texto.replace(TOKEN, "");
  return [...new Set(fora.map((n) => `{{${n}}}`)), ...(resto.includes("{{") || resto.includes("}}") ? ["chaves {{ }} sem par"] : [])];
}

const mensagemErro = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Erro inesperado.");

const ROTULO_CAMPO: Record<string, string> = { assunto: "assunto", corpo: "corpo", cco: "CCO", ativo: "ativação" };

export function EmailConfigPage() {
  const config = useEmailConfig();
  const [aba, setAba] = useState("plano_criado");
  const d = config.data;

  return (
    <div className={adminStyles.pagina}>
      <header className={adminStyles.cabecalho}>
        <div>
          <h1 className={adminStyles.titulo}>Configurações de e-mail</h1>
          <p className={adminStyles.subtitulo}>
            Modelos das notificações enviadas por e-mail na criação de Planos de Ação, ações e sub-itens. As notificações dentro do sistema
            continuam iguais. Cada alteração fica registrada com autor e data.
          </p>
        </div>
      </header>

      {config.isLoading ? (
        <p className={adminStyles.estado}>Carregando…</p>
      ) : config.error || !d ? (
        <p className={adminStyles.erro}>Não foi possível carregar: {mensagemErro(config.error)}</p>
      ) : (
        <>
          <CartaoRemetente d={d} />
          <CartaoCcoPadrao d={d} />
          <Tabs rotulo="Modelos de e-mail" abas={d.modelos.map((m) => ({ id: m.evento, rotulo: m.nome }))} ativa={aba} onSelecionar={setAba}>
            {/* Os três ficam montados (só o da aba aparece): trocar de aba não perde o que foi editado. */}
            {d.modelos.map((m) => (
              <div key={m.evento} hidden={m.evento !== aba}>
                {/* key: depois de salvar, o formulário recomeça da versão salva. */}
                <FormModelo key={m.atualizado_em ?? "padrao"} modelo={m} />
              </div>
            ))}
          </Tabs>
          <CartaoHistorico d={d} />
        </>
      )}
    </div>
  );
}

function CartaoRemetente({ d }: { d: ConfigEmailTela }) {
  const r = d.remetente;
  return (
    <Card titulo="Remetente e envio">
      <dl className={styles.dados}>
        <dt>Remetente do sistema</dt>
        <dd>{r.endereco ? `${r.nome} <${r.endereco}>` : "Não configurado"}</dd>
        <dt>Envio automático</dt>
        <dd>
          {r.habilitado ? <Badge tom="sucesso">Ligado</Badge> : <Badge tom="aviso">Desligado</Badge>}{" "}
          {!r.habilitado && <span className={styles.nota}>Os e-mails ficam só registrados até o envio ser ligado no servidor.</span>}
        </dd>
        <dt>Servidor</dt>
        <dd>{r.servidor ?? "Não configurado"}</dd>
      </dl>
      <p className={styles.nota}>
        Remetente, servidor e credenciais (SMTP / Microsoft 365) ficam no servidor, em variáveis de ambiente, e não são exibidos nem
        editados aqui.
      </p>
    </Card>
  );
}

function CartaoCcoPadrao({ d }: { d: ConfigEmailTela }) {
  const [texto, setTexto] = useState(d.cco_padrao.enderecos.join("\n"));
  const [ok, setOk] = useState(false);
  const salvar = useMutacaoAdmin((lista: string[]) => api.admin.email.salvarCcoPadrao(lista));
  const lista = paraLista(texto);
  const invalidos = lista.filter((e) => !EMAIL.test(e));
  const alterado = lista.join(",") !== d.cco_padrao.enderecos.join(",");

  return (
    <Card titulo="Cópia oculta (CCO) padrão — todas as notificações">
      <p className={styles.alerta} role="note">
        Os endereços abaixo receberão, em cópia oculta, <strong>todas</strong> as notificações por e-mail (novos Planos de Ação, ações e
        sub-itens), com todas as informações presentes na mensagem. Eles não aparecem para os demais destinatários.
      </p>
      <Field
        id="cco-padrao"
        rotulo="Endereços (um por linha ou separados por vírgula)"
        erro={invalidos.length ? `Endereço(s) inválido(s): ${invalidos.join(", ")}` : salvar.isError ? mensagemErro(salvar.error) : undefined}
      >
        <Textarea
          {...fieldAria("cco-padrao", invalidos.length ? "x" : undefined)}
          autoAjuste
          value={texto}
          placeholder="ex.: qualidade@suaempresa.com.br"
          onChange={(e) => {
            setTexto(e.target.value);
            setOk(false);
          }}
        />
      </Field>
      <div className={styles.rodape}>
        <span className={styles.nota}>
          {d.cco_padrao.atualizado_em
            ? `Alterado por ${d.cco_padrao.atualizado_por ?? "—"} em ${formatarDataHora(d.cco_padrao.atualizado_em)}.`
            : "Nenhum endereço cadastrado ainda."}
          {ok && " Salvo."}
        </span>
        <Button
          variante="primaria"
          disabled={!alterado || invalidos.length > 0 || salvar.isPending}
          onClick={() => salvar.mutate(lista, { onSuccess: () => setOk(true) })}
        >
          {salvar.isPending ? "Salvando…" : "Salvar CCO padrão"}
        </Button>
      </div>
    </Card>
  );
}

function FormModelo({ modelo }: { modelo: ModeloTela }) {
  const [assunto, setAssunto] = useState(modelo.assunto);
  const [corpo, setCorpo] = useState(modelo.corpo);
  const [cco, setCco] = useState(modelo.cco.join("\n"));
  const [ativo, setAtivo] = useState(modelo.ativo);
  const [salvo, setSalvo] = useState(false);
  const [previa, setPrevia] = useState<PreviaEmail | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  // Último campo de texto focado: o clique numa variável insere nele, na posição do cursor.
  const alvo = useRef<{ campo: "assunto" | "corpo"; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const permitidas = modelo.variaveis.map((v) => v.nome);
  const erroAssunto = variaveisDesconhecidas(assunto, permitidas);
  const erroCorpo = variaveisDesconhecidas(corpo, permitidas);
  const listaCco = paraLista(cco);
  const ccoInvalidos = listaCco.filter((e) => !EMAIL.test(e));
  const alterado =
    assunto !== modelo.assunto || corpo !== modelo.corpo || listaCco.join(",") !== modelo.cco.join(",") || ativo !== modelo.ativo;
  const valido = assunto.trim() !== "" && corpo.trim() !== "" && !erroAssunto.length && !erroCorpo.length && !ccoInvalidos.length;

  const salvar = useMutacaoAdmin(() => api.admin.email.salvarModelo(modelo.evento, { assunto, corpo, cco: listaCco, ativo }));
  // Prévia e teste não gravam nada: mutações simples, sem recarregar a tela.
  const mostrarPrevia = useMutation({ mutationFn: () => api.admin.email.previa({ evento: modelo.evento, assunto, corpo }) });

  // Aviso ao sair da página com alterações não salvas.
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const inserir = (nome: string) => {
    const token = `{{${nome}}}`;
    const a = alvo.current ?? { campo: "corpo" as const, el: document.getElementById(`corpo-${modelo.evento}`) as HTMLTextAreaElement };
    const atual = a.campo === "assunto" ? assunto : corpo;
    const ini = a.el?.selectionStart ?? atual.length;
    const fim = a.el?.selectionEnd ?? atual.length;
    const novo = atual.slice(0, ini) + token + atual.slice(fim);
    (a.campo === "assunto" ? setAssunto : setCorpo)(novo);
    setSalvo(false);
    requestAnimationFrame(() => {
      a.el?.focus();
      a.el?.setSelectionRange(ini + token.length, ini + token.length);
    });
  };

  const abrirPrevia = () => {
    setErroPrevia(null);
    mostrarPrevia.mutate(undefined, { onSuccess: setPrevia, onError: (e) => setErroPrevia(mensagemErro(e)) });
  };

  return (
    <div className={styles.modelo}>
      <div className={styles.colunaForm}>
        <Checkbox
          rotulo={`Enviar e-mail de “${modelo.nome}”`}
          checked={ativo}
          onChange={(e) => {
            setAtivo(e.target.checked);
            setSalvo(false);
          }}
        />
        {!ativo && <p className={styles.alerta}>Desativado: nenhum e-mail deste tipo será enviado (a notificação dentro do sistema continua).</p>}

        <Field id={`assunto-${modelo.evento}`} rotulo="Assunto" obrigatorio erro={erroAssunto.length ? `Variável inválida: ${erroAssunto.join(", ")}` : undefined}>
          <Input
            {...fieldAria(`assunto-${modelo.evento}`, erroAssunto.length ? "x" : undefined)}
            value={assunto}
            maxLength={255}
            onFocus={(e) => (alvo.current = { campo: "assunto", el: e.currentTarget })}
            onChange={(e) => {
              setAssunto(e.target.value);
              setSalvo(false);
            }}
          />
        </Field>

        <Field
          id={`corpo-${modelo.evento}`}
          rotulo="Corpo da mensagem"
          obrigatorio
          erro={erroCorpo.length ? `Variável inválida: ${erroCorpo.join(", ")}` : undefined}
          ajuda="Texto simples: linha em branco separa parágrafos. O botão “Acessar no sistema” é incluído automaticamente no fim."
        >
          <Textarea
            {...fieldAria(`corpo-${modelo.evento}`, erroCorpo.length ? "x" : undefined)}
            autoAjuste
            value={corpo}
            maxLength={20_000}
            onFocus={(e) => (alvo.current = { campo: "corpo", el: e.currentTarget })}
            onChange={(e) => {
              setCorpo(e.target.value);
              setSalvo(false);
            }}
          />
        </Field>

        <Field
          id={`cco-${modelo.evento}`}
          rotulo="Cópia oculta (CCO) deste modelo"
          erro={ccoInvalidos.length ? `Endereço(s) inválido(s): ${ccoInvalidos.join(", ")}` : undefined}
          ajuda="Um por linha ou separados por vírgula. Somados ao CCO padrão, sem repetir quem já recebe a mensagem."
        >
          <Textarea
            {...fieldAria(`cco-${modelo.evento}`, ccoInvalidos.length ? "x" : undefined)}
            autoAjuste
            value={cco}
            onChange={(e) => {
              setCco(e.target.value);
              setSalvo(false);
            }}
          />
        </Field>
        <p className={styles.alerta} role="note">
          Os endereços em CCO receberão todas as notificações de “{modelo.nome}”, com todas as informações presentes na mensagem.
        </p>

        {(salvar.isError || erroPrevia) && (
          <p className={adminStyles.erro} role="alert">
            {salvar.isError ? mensagemErro(salvar.error) : erroPrevia}
          </p>
        )}
        <div className={styles.rodape}>
          <span className={styles.nota}>
            {alterado
              ? "Alterações não salvas (os envios continuam usando a versão salva)."
              : modelo.personalizado
                ? `Salvo por ${modelo.atualizado_por ?? "—"} em ${modelo.atualizado_em ? formatarDataHora(modelo.atualizado_em) : "—"}.${salvo ? " Salvo agora." : ""}`
                : "Texto padrão do sistema."}
          </span>
          <div className={styles.botoes}>
            <Button onClick={() => setRestaurando(true)}>Restaurar modelo padrão</Button>
            <Button onClick={abrirPrevia} disabled={!valido || mostrarPrevia.isPending}>
              {mostrarPrevia.isPending ? "Gerando…" : "Visualizar prévia"}
            </Button>
            <Button onClick={() => setTestando(true)} disabled={!valido}>
              Enviar e-mail de teste
            </Button>
            <Button variante="primaria" disabled={!alterado || !valido || salvar.isPending} onClick={() => salvar.mutate(undefined, { onSuccess: () => setSalvo(true) })}>
              {salvar.isPending ? "Salvando…" : "Salvar modelo"}
            </Button>
          </div>
        </div>
      </div>

      <aside className={styles.colunaVariaveis} aria-labelledby={`vars-${modelo.evento}`}>
        <h3 id={`vars-${modelo.evento}`} className={styles.tituloVariaveis}>
          Variáveis disponíveis
        </h3>
        <p className={styles.nota}>Clique para inserir no assunto ou no corpo (onde estiver o cursor). Campo sem informação aparece como “—”.</p>
        <ul className={styles.variaveis}>
          {modelo.variaveis.map((v) => (
            <li key={v.nome}>
              <button type="button" className={styles.variavel} onClick={() => inserir(v.nome)} title={`Inserir {{${v.nome}}}`}>
                {`{{${v.nome}}}`}
              </button>
              <span className={styles.nota}>{v.descricao}</span>
            </li>
          ))}
        </ul>
      </aside>

      <Drawer aberto={previa !== null} titulo="Prévia do e-mail (dados fictícios)" largura={720} onFechar={() => setPrevia(null)}>
        {previa && (
          <div className={styles.previa}>
            <p className={styles.assuntoPrevia}>
              <span className={styles.nota}>Assunto</span>
              <strong>{previa.assunto}</strong>
            </p>
            {/* Mesmo HTML do envio real, isolado da página (sem scripts). */}
            <iframe title="Prévia do corpo do e-mail" className={styles.quadroPrevia} sandbox="" srcDoc={previa.html} />
            <p className={styles.nota}>Esta é uma prévia: nada foi salvo nem enviado.</p>
          </div>
        )}
      </Drawer>

      {testando && <ModalTeste evento={modelo.evento} assunto={assunto} corpo={corpo} onFechar={() => setTestando(false)} />}

      <Modal
        aberto={restaurando}
        titulo="Restaurar modelo padrão"
        onFechar={() => setRestaurando(false)}
        acoes={
          <>
            <Button onClick={() => setRestaurando(false)}>Cancelar</Button>
            <Button
              variante="perigo"
              onClick={() => {
                setAssunto(modelo.padrao_assunto);
                setCorpo(modelo.padrao_corpo);
                setSalvo(false);
                setRestaurando(false);
              }}
            >
              Substituir pelo padrão
            </Button>
          </>
        }
      >
        <p>O assunto e o corpo editados serão substituídos pelo texto padrão do sistema. A lista de CCO e a ativação não mudam.</p>
        <p>A mudança só vale para os envios depois que você clicar em “Salvar modelo”.</p>
      </Modal>
    </div>
  );
}

function ModalTeste({ evento, assunto, corpo, onFechar }: { evento: string; assunto: string; corpo: string; onFechar: () => void }) {
  const [destinatario, setDestinatario] = useState("");
  const enviar = useMutation({ mutationFn: () => api.admin.email.teste({ evento, assunto, corpo, destinatario: destinatario.trim() }) });
  const valido = EMAIL.test(destinatario.trim());
  const r = enviar.data;

  return (
    <Modal
      aberto
      titulo="Enviar e-mail de teste"
      onFechar={onFechar}
      acoes={
        <>
          <Button onClick={onFechar}>Fechar</Button>
          <Button variante="primaria" disabled={!valido || enviar.isPending} onClick={() => enviar.mutate(undefined)}>
            {enviar.isPending ? "Enviando…" : "Enviar teste"}
          </Button>
        </>
      }
    >
      <p>
        O teste usa o texto que está na tela (mesmo sem salvar) com <strong>dados fictícios</strong> e vai <strong>somente</strong> para o
        endereço abaixo: sem os destinatários reais e sem as listas de CCO.
      </p>
      <Field id="teste-destinatario" rotulo="Enviar para" obrigatorio>
        <Input {...fieldAria("teste-destinatario")} type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
      </Field>
      {enviar.isError && (
        <p className={adminStyles.erro} role="alert">
          {mensagemErro(enviar.error)}
        </p>
      )}
      {r && (
        <p className={r.enviado ? adminStyles.sucesso : adminStyles.erro} role="status">
          {r.enviado ? `Enviado para ${r.destinatario}: “${r.assunto}”.` : `Não foi possível enviar: ${r.erro ?? "erro desconhecido"}`}
        </p>
      )}
    </Modal>
  );
}

function CartaoHistorico({ d }: { d: ConfigEmailTela }) {
  return (
    <Card titulo="Histórico de alterações" semPadding vazio={d.historico.length === 0} mensagemVazio="Nenhuma alteração ainda.">
      <Table>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">Onde</th>
            <th scope="col">O que mudou</th>
          </tr>
        </thead>
        <tbody>
          {d.historico.map((h) => (
            <tr key={h.id}>
              <td>{formatarDataHora(h.criado_em)}</td>
              <td>{h.usuario ?? "—"}</td>
              <td>{h.escopo_nome}</td>
              <td>
                {h.campo === "ativo"
                  ? h.valor_novo === "True"
                    ? "Envio ativado"
                    : "Envio desativado"
                  : h.campo === "cco"
                    ? `CCO: ${h.valor_novo || "(vazio)"}`
                    : `Alterou o ${ROTULO_CAMPO[h.campo] ?? h.campo}`}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
