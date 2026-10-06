import type { ConviteVerificado, UsuarioLogado } from "@planogestao/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CarregandoTela } from "../components/feedback/CarregandoTela";
import { ControlesAparencia } from "../components/layout/ControlesAparencia";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, fieldAria } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { paginaInicial } from "../routes/menu";
import { api } from "../services/api";
import { useAuthStore } from "../store/authStore";
import styles from "./LoginPage.module.css";

// O token vem no fragmento (#t=…): não é enviado ao servidor web. Lido uma vez e retirado da barra de endereço.
// Guardado em memória: o React (StrictMode) pode chamar o inicializador duas vezes, e a 2ª já não veria o #t.
let tokenLido: string | null = null;

function lerToken(): string {
  const doEndereco = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
  if (doEndereco) {
    tokenLido = doEndereco;
    window.history.replaceState(null, "", window.location.pathname);
  }
  return tokenLido ?? "";
}

const politica = (s: string) => s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);

/** Primeiro acesso pelo convite: definir a senha, ativar a conta e entrar já logado. */
export function PrimeiroAcessoPage() {
  const [token] = useState(lerToken);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const atual = useAuthStore((s) => s.usuario);
  const [convite, setConvite] = useState<ConviteVerificado | null>(null);
  const [falhaRede, setFalhaRede] = useState(false);
  // Outra conta logada neste navegador: a troca precisa de uma escolha explícita.
  const [trocaAceita, setTrocaAceita] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrarErros, setMostrarErros] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setConvite({ situacao: "invalido", mensagem: "Link de convite inválido. Abra o endereço completo do e-mail." });
      return;
    }
    api.auth
      .verificarConvite(token)
      .then(setConvite)
      .catch(() => setFalhaRede(true));
  }, [token]);

  if (status === "verificando" || (!convite && !falhaRede)) return <CarregandoTela />;

  const outraConta: UsuarioLogado | null = status === "autenticado" && atual && atual.email !== convite?.email ? atual : null;
  const erros = {
    senha: !senha ? "Informe a nova senha." : !politica(senha) ? "Mínimo de 8 caracteres, com letras e números." : undefined,
    confirmacao: confirmacao !== senha ? "As senhas não coincidem." : undefined,
  };

  const encerrarOutraSessao = async () => {
    try {
      await api.auth.logout();
    } finally {
      useAuthStore.getState().encerrarSessao();
      queryClient.clear();
      setTrocaAceita(true);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setMostrarErros(true);
    if (erros.senha || erros.confirmacao) return;
    setEnviando(true);
    setErro(null);
    try {
      const sessao = await api.auth.primeiroAcesso(token, senha, confirmacao);
      navigate(paginaInicial(sessao.usuario), { replace: true });
    } catch (exc) {
      setErro(exc instanceof Error ? exc.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.aparencia}>
        <ControlesAparencia comDensidade={false} />
      </div>
      <Card className={styles.cartaoLogin}>
        <div className={styles.formulario}>
          <div className={styles.marca}>
            <span className={styles.logomarca} aria-hidden="true">
              P
            </span>
            <div>
              <h1 className={styles.titulo}>Primeiro acesso</h1>
              <p className={styles.subtitulo}>Mallory · Gestão de Planos de Ação</p>
            </div>
          </div>

          {falhaRede ? (
            <div className={styles.erro} role="alert">
              Não foi possível conectar ao servidor. Recarregue a página pelo link do e-mail.
            </div>
          ) : convite?.situacao !== "valido" ? (
            <>
              <div className={styles.erro} role="alert">
                {convite?.mensagem}
              </div>
              <Link to="/login">Ir para o login</Link>
            </>
          ) : outraConta && !trocaAceita ? (
            <div role="alert">
              <p className={styles.instrucao}>
                Este navegador está conectado como <strong>{outraConta.nome}</strong> ({outraConta.email}). O convite é para{" "}
                <strong>{convite.nome}</strong> ({convite.email}).
              </p>
              <p className={styles.instrucao}>Para ativar a conta convidada, a sessão atual será encerrada. Escolha:</p>
              <div className={styles.escolhas}>
                <Button variante="primaria" onClick={() => void encerrarOutraSessao()}>
                  Encerrar a sessão de {outraConta.nome.split(" ")[0]} e continuar
                </Button>
                <Button onClick={() => navigate("/", { replace: true })}>Manter {outraConta.nome.split(" ")[0]} conectado</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void enviar(e)} noValidate className={styles.formulario}>
              <p className={styles.instrucao}>
                Olá, {convite.nome}. Defina a senha da conta <strong>{convite.email}</strong>.
              </p>
              {erro && (
                <div className={styles.erro} role="alert">
                  {erro}
                </div>
              )}
              <Field id="pa-senha" rotulo="Nova senha" obrigatorio erro={mostrarErros ? erros.senha : undefined} ajuda="Mínimo de 8 caracteres, com letras e números.">
                <Input {...fieldAria("pa-senha", mostrarErros ? erros.senha : undefined)} type="password" autoComplete="new-password" maxLength={128} value={senha} onChange={(e) => setSenha(e.target.value)} />
              </Field>
              <Field id="pa-confirmacao" rotulo="Confirmar senha" obrigatorio erro={mostrarErros ? erros.confirmacao : undefined}>
                <Input
                  {...fieldAria("pa-confirmacao", mostrarErros ? erros.confirmacao : undefined)}
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </Field>
              <Button type="submit" variante="primaria" bloco disabled={enviando}>
                {enviando ? "Ativando…" : "Definir senha e acessar"}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
