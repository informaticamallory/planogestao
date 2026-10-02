import type { CorDestaque, TamanhoFonte, TemaPreferido, UsuarioLogado } from "@planogestao/shared-types";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "../../components/admin/Admin.module.css";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field, fieldAria } from "../../components/ui/Field";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Input } from "../../components/ui/Input";
import { KpiCard } from "../../components/ui/KpiCard";
import { Tabs } from "../../components/ui/Tabs";
import { useAtualizarMeuPerfil, useEnviarFoto, useRemoverFoto, useSalvarAparencia, useTrocarSenha } from "../../hooks/useMeuPerfil";
import { useAparencia } from "../../store/aparenciaStore";
import { useAuthStore } from "../../store/authStore";
import estilos from "./MeuPerfil.module.css";

type Aba = "dados" | "aparencia" | "seguranca";
const ABAS: Aba[] = ["dados", "aparencia", "seguranca"];

// Mesmas regras do backend (ele revalida o conteúdo real da imagem).
const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];
const FOTO_MAX_MB = 5;

const TEMAS: { id: TemaPreferido; rotulo: string; icone: IconName; ajuda: string }[] = [
  { id: "claro", rotulo: "Claro", icone: "sun", ajuda: "Sempre claro" },
  { id: "escuro", rotulo: "Escuro", icone: "moon", ajuda: "Sempre escuro" },
  { id: "automatico", rotulo: "Automático", icone: "layout", ajuda: "Segue o sistema operacional" },
];
// Mesmas porcentagens de styles/tokens.css (html[data-fonte]).
const FONTES: { id: TamanhoFonte; rotulo: string; pct: string }[] = [
  { id: "pequeno", rotulo: "Pequeno", pct: "87,5%" },
  { id: "padrao", rotulo: "Padrão", pct: "100%" },
  { id: "grande", rotulo: "Grande", pct: "112,5%" },
  { id: "extra_grande", rotulo: "Extra grande", pct: "125%" },
];
// Amostras com os mesmos valores dos tokens (styles/tokens.css, [data-accent]).
const CORES: { id: CorDestaque | null; rotulo: string; amostra: string }[] = [
  { id: null, rotulo: "Laranja Mallory (padrão)", amostra: "oklch(0.682 0.197 44.5)" },
  { id: "azul", rotulo: "Azul", amostra: "oklch(0.52 0.14 250)" },
  { id: "verde", rotulo: "Verde", amostra: "oklch(0.52 0.14 155)" },
  { id: "roxo", rotulo: "Roxo", amostra: "oklch(0.52 0.14 300)" },
  { id: "petroleo", rotulo: "Petróleo", amostra: "oklch(0.52 0.14 200)" },
];

/**
 * A conta do próprio usuário: dados pessoais, aparência e senha.
 * Perfil de acesso, área e setor não aparecem aqui de propósito: são definidos só pela Administração.
 */
export function MeuPerfilPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.includes(params.get("aba") as Aba) ? (params.get("aba") as Aba) : "dados";

  if (!usuario) return null;

  return (
    <div className={styles.pagina} style={{ maxWidth: 820 }}>
      <header>
        <h1 className={styles.titulo}>Meu perfil</h1>
        <p className={styles.subtitulo}>Suas informações e preferências. Valem só para a sua conta, em qualquer dispositivo.</p>
      </header>

      <Tabs<Aba>
        rotulo="Seções do perfil"
        ativa={aba}
        onSelecionar={(id) => setParams(id === "dados" ? {} : { aba: id }, { replace: true })}
        abas={[
          { id: "dados", rotulo: "Dados pessoais" },
          { id: "aparencia", rotulo: "Aparência" },
          { id: "seguranca", rotulo: "Segurança" },
        ]}
      >
        {aba === "dados" && <AbaDados usuario={usuario} />}
        {aba === "aparencia" && <AbaAparencia />}
        {aba === "seguranca" && <AbaSeguranca />}
      </Tabs>
    </div>
  );
}

function AbaDados({ usuario }: { usuario: UsuarioLogado }) {
  const atualizar = useAtualizarMeuPerfil();
  const enviarFoto = useEnviarFoto();
  const removerFoto = useRemoverFoto();
  const [nome, setNome] = useState(usuario.nome);
  const [erroNome, setErroNome] = useState<string>();
  const [salvo, setSalvo] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [erroFoto, setErroFoto] = useState<string>();
  const entrada = useRef<HTMLInputElement>(null);

  // Libera a URL temporária do preview.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const nomeNormalizado = nome.trim().split(/\s+/).join(" ");
  const nomeAlterado = nomeNormalizado !== usuario.nome;

  const salvarNome = (e: FormEvent) => {
    e.preventDefault();
    setSalvo(false);
    if (nomeNormalizado.length < 3) return setErroNome("Informe um nome com pelo menos 3 caracteres.");
    atualizar.mutate({ nome: nomeNormalizado }, { onSuccess: (u) => (setNome(u.nome), setSalvo(true)) });
  };

  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    enviarFoto.reset();
    if (!f) return;
    if (!FOTO_TIPOS.includes(f.type)) return setErroFoto("Escolha uma imagem JPEG, PNG ou WebP.");
    if (f.size > FOTO_MAX_MB * 1024 * 1024) return setErroFoto(`A foto deve ter no máximo ${FOTO_MAX_MB} MB.`);
    setErroFoto(undefined);
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
  };

  const descartar = () => {
    setArquivo(null);
    setPreview(null);
  };

  const erroApiFoto = enviarFoto.error?.message ?? removerFoto.error?.message;

  return (
    <div className={estilos.secoes}>
      <Card titulo="Foto">
        <div className={estilos.foto}>
          {preview ? (
            <img src={preview} alt="Pré-visualização da nova foto" className={estilos.preview} />
          ) : (
            <Avatar nome={usuario.nome} url={usuario.avatar_url} tamanho="xl" className={estilos.avatarGrande} />
          )}
          <div className={estilos.fotoAcoes}>
            {arquivo ? (
              <>
                <p className={estilos.dica}>Pré-visualização. A foto é recortada no centro, em formato quadrado.</p>
                <div className={estilos.botoes}>
                  <Button variante="primaria" disabled={enviarFoto.isPending} onClick={() => enviarFoto.mutate(arquivo, { onSuccess: descartar })}>
                    {enviarFoto.isPending ? "Enviando…" : "Usar esta foto"}
                  </Button>
                  <Button onClick={descartar} disabled={enviarFoto.isPending}>
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={estilos.dica}>JPEG, PNG ou WebP, até {FOTO_MAX_MB} MB.</p>
                <div className={estilos.botoes}>
                  <Button onClick={() => entrada.current?.click()}>
                    <Icon name="upload" size={15} />
                    {usuario.avatar_url ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  {usuario.avatar_url && (
                    <Button variante="link" disabled={removerFoto.isPending} onClick={() => removerFoto.mutate()}>
                      Remover foto
                    </Button>
                  )}
                </div>
              </>
            )}
            <input ref={entrada} type="file" accept={FOTO_TIPOS.join(",")} hidden onChange={escolher} aria-label="Escolher foto" />
            {(erroFoto || erroApiFoto) && (
              <p className={styles.erro} role="alert">
                {erroFoto ?? erroApiFoto}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card titulo="Dados pessoais">
        <form className={estilos.form} onSubmit={salvarNome} noValidate>
          <Field id="mp-nome" rotulo="Nome de exibição" obrigatorio erro={erroNome} ajuda="Como você aparece no menu, nos planos e no ranking.">
            <Input
              {...fieldAria("mp-nome", erroNome)}
              value={nome}
              maxLength={150}
              autoComplete="name"
              onChange={(e) => {
                setNome(e.target.value);
                setErroNome(undefined);
                setSalvo(false);
                atualizar.reset();
              }}
            />
          </Field>
          <Field id="mp-email" rotulo="E-mail" ajuda="Usado no login. Para trocar, fale com a Administração.">
            <Input id="mp-email" value={usuario.email} readOnly aria-readonly="true" className={estilos.somenteLeitura} />
          </Field>
          {atualizar.error && <p className={styles.erro}>{atualizar.error.message}</p>}
          <div className={estilos.rodapeForm}>
            {salvo && !nomeAlterado && (
              <span className={styles.sucesso} role="status">
                Nome atualizado.
              </span>
            )}
            <Button type="submit" variante="primaria" disabled={!nomeAlterado || atualizar.isPending}>
              {atualizar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function AbaAparencia() {
  const { preferencia, cor, fonte } = useAparencia();
  const salvar = useSalvarAparencia();

  return (
    <div className={estilos.secoes}>
      <Card titulo="Tema">
        <p className={estilos.dica}>Salvo na sua conta: vale em qualquer computador. O ícone de lua/sol no topo também altera esta escolha.</p>
        <div className={estilos.opcoes} role="radiogroup" aria-label="Tema">
          {TEMAS.map((t) => (
            <label key={t.id} className={estilos.opcao} data-ativa={preferencia === t.id || undefined}>
              <input type="radio" name="tema" value={t.id} checked={preferencia === t.id} onChange={() => salvar.mutate({ tema: t.id })} />
              <Icon name={t.icone} size={18} />
              <span className={estilos.opcaoTexto}>
                <strong>{t.rotulo}</strong>
                <span>{t.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card titulo="Tamanho da fonte">
        <p className={estilos.dica}>
          Vale para todo o sistema, neste e nos outros dispositivos (inclusive o app). Textos, espaços e componentes crescem juntos.
        </p>
        <div className={estilos.fontes} role="radiogroup" aria-label="Tamanho da fonte">
          {FONTES.map((f, i) => (
            <label key={f.id} className={estilos.opcaoFonte} data-ativa={fonte === f.id || undefined}>
              <input type="radio" name="fonte" value={f.id} checked={fonte === f.id} onChange={() => salvar.mutate({ tamanho_fonte: f.id })} />
              {/* "Aa" crescente: dá a noção do tamanho antes de escolher. */}
              <span className={estilos.amostraFonte} style={{ fontSize: `${1 + i * 0.25}rem` }} aria-hidden="true">
                Aa
              </span>
              <span className={estilos.opcaoTexto}>
                <strong>{f.rotulo}</strong>
                <span>{f.pct}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Pré-visualização ao vivo: usa os mesmos componentes da interface, já no tamanho escolhido. */}
        <div className={estilos.previa} aria-label="Pré-visualização">
          <span className={estilos.rotuloPrevia}>Pré-visualização</span>
          <div className={estilos.conteudoPrevia}>
            <div className={estilos.textoPrevia}>
              <h3 className={estilos.tituloPrevia}>Plano PA-2026-014 · Redução de refugo na linha 3</h3>
              <p>
                Ação &ldquo;Revisar o procedimento de setup&rdquo; vence em 3 dias. Responsável: Fernanda Rocha. Progresso atual de 60%.
              </p>
              <div className={estilos.botoes}>
                <Button variante="primaria" tamanho="sm" tabIndex={-1}>
                  Registrar progresso
                </Button>
                <Button tamanho="sm" tabIndex={-1}>
                  Ver plano
                </Button>
              </div>
            </div>
            <KpiCard valor="72%" rotulo="Ações no prazo" dica="36 de 50 ações" tom="sucesso" className={estilos.kpiPrevia} />
          </div>
        </div>
      </Card>

      <Card titulo="Cor de destaque">
        <p className={estilos.dica}>Usada em botões, links e itens selecionados. As cores de status e de prazo (em atraso, concluído…) não mudam.</p>
        <div className={estilos.cores} role="radiogroup" aria-label="Cor de destaque">
          {CORES.map((c) => (
            <label key={c.id ?? "padrao"} className={estilos.cor} data-ativa={cor === c.id || undefined} title={c.rotulo}>
              <input type="radio" name="cor" checked={cor === c.id} onChange={() => salvar.mutate({ cor_destaque: c.id })} aria-label={c.rotulo} />
              <span className={estilos.amostra} style={{ background: c.amostra }} aria-hidden="true">
                {cor === c.id && <Icon name="check" size={16} />}
              </span>
              <span className={estilos.rotuloCor}>{c.id ? c.rotulo : "Padrão"}</span>
            </label>
          ))}
        </div>
      </Card>

      <p className={estilos.status} role="status">
        {salvar.isPending ? "Salvando…" : salvar.isError ? `Não foi possível salvar: ${salvar.error.message}` : salvar.isSuccess ? "Salvo na sua conta." : ""}
      </p>
    </div>
  );
}

type ErrosSenha = Partial<Record<"atual" | "nova" | "confirmacao", string>>;

function AbaSeguranca() {
  const trocar = useTrocarSenha();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erros, setErros] = useState<ErrosSenha>({});

  const mudar = (setter: (v: string) => void, campo: keyof ErrosSenha) => (e: ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setErros((x) => ({ ...x, [campo]: undefined }));
    trocar.reset();
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Mesmas regras do backend (ele revalida).
    const encontrados: ErrosSenha = {};
    if (!atual) encontrados.atual = "Informe a senha atual.";
    if (nova.length < 8 || !/[A-Za-z]/.test(nova) || !/\d/.test(nova)) encontrados.nova = "Mínimo de 8 caracteres, com letras e números.";
    else if (nova === atual) encontrados.nova = "A nova senha deve ser diferente da atual.";
    if (confirmacao !== nova) encontrados.confirmacao = "A confirmação não confere.";
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    trocar.mutate(
      { senha_atual: atual, nova_senha: nova },
      {
        onSuccess: () => {
          setAtual("");
          setNova("");
          setConfirmacao("");
        },
      },
    );
  };

  return (
    <Card titulo="Trocar senha">
      <form className={estilos.form} onSubmit={enviar} noValidate>
        <Field id="mp-senha-atual" rotulo="Senha atual" obrigatorio erro={erros.atual}>
          <Input {...fieldAria("mp-senha-atual", erros.atual)} type="password" autoComplete="current-password" value={atual} onChange={mudar(setAtual, "atual")} />
        </Field>
        <Field id="mp-senha-nova" rotulo="Nova senha" obrigatorio erro={erros.nova} ajuda="Mínimo de 8 caracteres, com letras e números.">
          <Input {...fieldAria("mp-senha-nova", erros.nova)} type="password" autoComplete="new-password" value={nova} onChange={mudar(setNova, "nova")} />
        </Field>
        <Field id="mp-senha-conf" rotulo="Confirmar nova senha" obrigatorio erro={erros.confirmacao}>
          <Input {...fieldAria("mp-senha-conf", erros.confirmacao)} type="password" autoComplete="new-password" value={confirmacao} onChange={mudar(setConfirmacao, "confirmacao")} />
        </Field>
        {trocar.error && <p className={styles.erro}>{trocar.error.message}</p>}
        {trocar.isSuccess && (
          <p className={styles.sucesso} role="status">
            Senha alterada. Você continua conectado aqui; as sessões em outros dispositivos foram encerradas.
          </p>
        )}
        <div className={estilos.rodapeForm}>
          <Button type="submit" variante="primaria" disabled={trocar.isPending}>
            {trocar.isPending ? "Alterando…" : "Alterar senha"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
