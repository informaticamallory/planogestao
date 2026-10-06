import type { UsuarioAdminItem } from "@planogestao/shared-types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { AvisoErro } from "../../../../../components/AvisoErro";
import { Botao } from "../../../../../components/Botao";
import { CampoTexto } from "../../../../../components/Campos";
import { Escolha } from "../../../../../components/Escolhas";
import { Aviso, Interruptor, TelaFormulario } from "../../../../../components/admin/UiAdmin";
import { useAreasAdmin, useMutacaoAdmin, usePerfisAdmin, useSetoresAdmin, useUsuarioAdmin } from "../../../../../hooks/useAdmin";
import { api } from "../../../../../services/api";
import { useAuthStore } from "../../../../../store/authStore";
import { cores } from "../../../../../theme";
import { errosDaApi } from "../../../../../utils/errosApi";

interface Form {
  nome: string;
  email: string;
  perfil_id?: number;
  area_id?: number;
  setor_id?: number;
  avatar_url: string;
  ativo: boolean;
  senha: string;
}
type Erros = Partial<Record<keyof Form, string>>;

const vazio: Form = { nome: "", email: "", avatar_url: "", ativo: true, senha: "" };
const doUsuario = (u: UsuarioAdminItem): Form => ({
  nome: u.nome,
  email: u.email,
  perfil_id: u.perfil.id,
  area_id: u.area?.id,
  setor_id: u.setor?.id,
  avatar_url: u.avatar_url ?? "",
  ativo: u.ativo,
  senha: "",
});

/** Mesmas regras do formulário web (UsuariosPage.validar); o backend revalida e tem a palavra final. */
function validar(f: Form, criando: boolean): Erros {
  const e: Erros = {};
  if (f.nome.trim().split(/\s+/).join(" ").length < 3) e.nome = "Informe o nome completo.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = "E-mail inválido.";
  if (!f.perfil_id) e.perfil_id = "Selecione o perfil.";
  if (f.setor_id && !f.area_id) e.setor_id = "Selecione a área da função/cargo.";
  if (f.avatar_url.trim() && !/^(https?:\/\/|\/usuarios\/fotos\/)/.test(f.avatar_url.trim())) e.avatar_url = "Use um endereço http(s).";
  if (criando && !f.senha) e.senha = "Informe a senha inicial.";
  if (f.senha && (f.senha.length < 8 || !/[A-Za-z]/.test(f.senha) || !/\d/.test(f.senha))) e.senha = "Mínimo de 8 caracteres, com letras e números.";
  return e;
}

export default function FormUsuario() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const criando = id === "novo";
  const usuarioId = criando ? null : Number(id);
  const eu = useAuthStore((s) => s.usuario);
  const proprio = usuarioId !== null && usuarioId === eu?.id;

  const usuario = useUsuarioAdmin(usuarioId);
  const perfis = usePerfisAdmin();
  const areas = useAreasAdmin();
  const setores = useSetoresAdmin();

  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Erros>({});
  useEffect(() => {
    if (usuario.data) setForm(doUsuario(usuario.data));
  }, [usuario.data]);

  const salvar = useMutacaoAdmin(async (f: Form) => {
    const base = {
      nome: f.nome.trim(),
      email: f.email.trim(),
      perfil_id: f.perfil_id!,
      area_id: f.area_id ?? null,
      setor_id: f.setor_id ?? null,
      avatar_url: f.avatar_url.trim() || null,
      ativo: f.ativo,
    };
    return usuarioId ? api.admin.usuarios.atualizar(usuarioId, { ...base, nova_senha: f.senha || null }) : api.admin.usuarios.criar({ ...base, senha: f.senha });
  });
  const inativar = useMutacaoAdmin((uid: number) => api.admin.usuarios.inativar(uid));

  // Erros da API (422 do Pydantic por campo; 409 e-mail duplicado etc. como mensagem geral).
  const daApi = errosDaApi(salvar.error, { nova_senha: "senha" });
  const erroDe = (c: keyof Form) => erros[c] ?? daApi.campos[c];

  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    setErros((e) => ({ ...e, [campo]: undefined }));
    salvar.reset();
    setForm((f) => ({ ...f, [campo]: valor, ...(campo === "area_id" ? { setor_id: undefined } : {}) }));
  };

  const enviar = () => {
    const encontrados = validar(form, criando);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    salvar.mutate(form, {
      onSuccess: (u) => {
        Alert.alert(criando ? "Usuário criado" : "Usuário atualizado", `“${u.nome}” ${criando ? "já pode acessar o sistema" : "foi salvo"}.${form.senha && !criando ? " Senha redefinida; as sessões dele foram encerradas." : ""}`);
        router.back();
      },
    });
  };

  const confirmarInativacao = () =>
    Alert.alert("Inativar usuário", `${form.nome} perde o acesso imediatamente e as sessões abertas são encerradas. Planos, ações e histórico continuam registrados. É possível reativar depois.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Inativar", style: "destructive", onPress: () => usuarioId && inativar.mutate(usuarioId, { onSuccess: () => router.back() }) },
    ]);

  const titulo = <Stack.Screen options={{ title: criando ? "Novo usuário" : "Editar usuário" }} />;
  if (!criando && usuario.error) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: cores.fundo }}>
        {titulo}
        <AvisoErro erro={usuario.error} onTentar={() => void usuario.refetch()} />
      </View>
    );
  }
  if (!criando && !usuario.data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: cores.fundo }}>
        {titulo}
        <ActivityIndicator color={cores.primaria} size="large" />
      </View>
    );
  }

  const areasOpcoes = (areas.data ?? []).filter((a) => a.ativo || a.id === form.area_id);
  const setoresDaArea = (setores.data ?? []).filter((s) => s.area_id === form.area_id && (s.ativo || s.id === form.setor_id));

  return (
    <TelaFormulario
      rodape={
        <>
          <Botao texto="Cancelar" onPress={() => router.back()} flex />
          <Botao texto={criando ? "Criar usuário" : "Salvar"} variante="primaria" onPress={enviar} carregando={salvar.isPending} flex />
        </>
      }
    >
      {titulo}
      {daApi.geral && <Aviso tipo="erro" texto={daApi.geral} />}
      {inativar.error && <Aviso tipo="erro" texto={errosDaApi(inativar.error).geral ?? ""} />}
      <CampoTexto rotulo="Nome completo" obrigatorio value={form.nome} maxLength={150} onChangeText={(v) => mudar("nome", v)} erro={erroDe("nome")} />
      <CampoTexto
        rotulo="E-mail"
        obrigatorio
        value={form.email}
        maxLength={255}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        onChangeText={(v) => mudar("email", v)}
        erro={erroDe("email")}
      />
      <View style={{ gap: 4 }}>
        <Escolha rotulo="Perfil *" todos="Selecione…" valor={form.perfil_id} opcoes={perfis.data ?? []} onEscolher={(v) => !proprio && mudar("perfil_id", v)} />
        {proprio && <Aviso tipo="info" texto="Você não pode trocar o seu próprio perfil." />}
        {erroDe("perfil_id") && <Aviso tipo="erro" texto={erroDe("perfil_id")!} />}
      </View>
      <Escolha rotulo="Área" todos="Sem área" valor={form.area_id} opcoes={areasOpcoes} onEscolher={(v) => mudar("area_id", v)} />
      {form.area_id ? (
        <View style={{ gap: 4 }}>
          <Escolha rotulo="Função/Cargo" todos="Sem função/cargo" valor={form.setor_id} opcoes={setoresDaArea} onEscolher={(v) => mudar("setor_id", v)} />
          {erroDe("setor_id") && <Aviso tipo="erro" texto={erroDe("setor_id")!} />}
        </View>
      ) : null}
      <CampoTexto
        rotulo="Foto (URL)"
        value={form.avatar_url}
        placeholder="https://…"
        maxLength={500}
        keyboardType="url"
        autoCapitalize="none"
        onChangeText={(v) => mudar("avatar_url", v)}
        erro={erroDe("avatar_url")}
      />
      <CampoTexto
        rotulo={criando ? "Senha inicial" : "Nova senha"}
        obrigatorio={criando}
        value={form.senha}
        maxLength={128}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onChangeText={(v) => mudar("senha", v)}
        erro={erroDe("senha")}
        ajuda={criando ? "Mínimo de 8 caracteres, com letras e números." : "Deixe em branco para manter. Redefinir encerra as sessões do usuário."}
      />
      <Interruptor
        rotulo="Ativo"
        ajuda={proprio ? "Você não pode inativar a si mesmo." : "Inativo não consegue entrar no sistema."}
        valor={form.ativo}
        desabilitado={proprio}
        onAlterar={(v) => mudar("ativo", v)}
      />
      {!criando && !proprio && usuario.data?.ativo && (
        <Botao texto="Inativar usuário" variante="perigo" icone="alert" onPress={confirmarInativacao} carregando={inativar.isPending} />
      )}
    </TelaFormulario>
  );
}
