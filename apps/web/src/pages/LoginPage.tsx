import { ApiError } from "@planogestao/api-client";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { CarregandoTela } from "../components/feedback/CarregandoTela";
import { ControlesAparencia } from "../components/layout/ControlesAparencia";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useLogin } from "../hooks/useAuth";
import { useAuthStore } from "../store/authStore";
import styles from "./LoginPage.module.css";

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ApiError) return erro.message;
  return "Não foi possível conectar ao servidor. Tente novamente.";
}

export function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const login = useLogin();

  if (status === "verificando") return <CarregandoTela />;
  if (status === "autenticado") return <Navigate to={destino} replace />;

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    login.mutate({ email, senha }, { onSuccess: () => navigate(destino, { replace: true }) });
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.aparencia}>
        <ControlesAparencia comDensidade={false} />
      </div>
      <Card className={styles.cartaoLogin}>
        <form className={styles.formulario} onSubmit={enviar} noValidate>
          <div className={styles.marca}>
            <span className={styles.logomarca} aria-hidden="true">
              P
            </span>
            <div>
              <h1 className={styles.titulo}>PlanoGestão</h1>
              <p className={styles.subtitulo}>Mallory · Gestão de Planos de Ação</p>
            </div>
          </div>
          <p className={styles.instrucao}>Acesse com seu e-mail corporativo.</p>

          {login.isError && (
            <div className={styles.erro} role="alert">
              {mensagemDeErro(login.error)}
            </div>
          )}

          <label className={styles.campo}>
            <span className={styles.rotulo}>E-mail</span>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className={styles.campo}>
            <span className={styles.rotulo}>Senha</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>

          <Button variante="primaria" bloco type="submit" disabled={login.isPending || !email || !senha}>
            {login.isPending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
