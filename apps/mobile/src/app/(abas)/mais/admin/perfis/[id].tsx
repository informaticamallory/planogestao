import type { CatalogoPermissoes, PerfilItem } from "@planogestao/shared-types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { Botao } from "../../../../../components/Botao";
import { CampoTexto } from "../../../../../components/Campos";
import { Icone } from "../../../../../components/Icone";
import { Aviso, Interruptor, TelaFormulario } from "../../../../../components/admin/UiAdmin";
import { useCatalogoPermissoes, useMutacaoAdmin, usePerfisAdmin } from "../../../../../hooks/useAdmin";
import { api } from "../../../../../services/api";
import { cores, escalarTexto, espaco, estilosDinamicos, fonte, raio } from "../../../../../theme";
import { errosDaApi } from "../../../../../utils/errosApi";

type Permissao = CatalogoPermissoes["permissoes"][number];

export default function EditorPerfil() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const novo = id === "novo";
  const perfis = usePerfisAdmin();
  const catalogo = useCatalogoPermissoes();
  const perfil: PerfilItem | null = novo ? null : (perfis.data?.find((p) => String(p.id) === id) ?? null);
  const somenteLeitura = perfil !== null && !perfil.editavel;

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [erroNome, setErroNome] = useState<string>();

  useEffect(() => {
    if (perfil) {
      setNome(perfil.nome);
      setDescricao(perfil.descricao ?? "");
      setMarcadas(new Set(perfil.permissoes));
    }
    // Só ao abrir outro perfil: um refetch da lista não pode apagar o que está sendo editado.
  }, [perfil?.id]);

  const salvar = useMutacaoAdmin(() => {
    const corpo = { nome: nome.trim(), descricao: descricao.trim() || null, permissoes: [...marcadas].sort() };
    return perfil ? api.admin.perfis.atualizar(perfil.id, corpo) : api.admin.perfis.criar(corpo);
  });
  const excluir = useMutacaoAdmin((pid: number) => api.admin.perfis.excluir(pid));
  const daApi = errosDaApi(salvar.error);

  // Módulo → ações existentes, na ordem do catálogo (mesmas células habilitadas da matriz web).
  const porModulo = useMemo(() => {
    const m = new Map<string, Permissao[]>();
    for (const p of catalogo.data?.permissoes ?? []) m.set(p.modulo, [...(m.get(p.modulo) ?? []), p]);
    const ordemAcao = new Map((catalogo.data?.acoes ?? []).map((a, i) => [a.id, i]));
    for (const lista of m.values()) lista.sort((a, b) => (ordemAcao.get(a.acao) ?? 99) - (ordemAcao.get(b.acao) ?? 99));
    return m;
  }, [catalogo.data]);
  const nomeAcao = (acao: string) => catalogo.data?.acoes.find((a) => a.id === acao)?.nome ?? acao;

  const alternar = (codigo: string) =>
    setMarcadas((atual) => {
      const s = new Set(atual);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });
  const marcado = (codigo: string) => somenteLeitura || marcadas.has(codigo);

  const enviar = () => {
    if (nome.trim().length < 2) return setErroNome("Informe um nome com pelo menos 2 caracteres.");
    salvar.mutate(undefined, {
      onSuccess: () => {
        Alert.alert("Perfil salvo", "Usuários com este perfil passam a ter as novas permissões na próxima ação no sistema.");
        router.back();
      },
    });
  };

  const confirmarExclusao = () =>
    perfil &&
    Alert.alert("Excluir perfil", `Excluir o perfil “${perfil.nome}”? Só é possível se nenhum usuário o utilizar${perfil.usuarios ? ` — hoje ${perfil.usuarios} usuário(s) usam este perfil` : ""}.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => excluir.mutate(perfil.id, { onSuccess: () => router.back() }) },
    ]);

  const titulo = <Stack.Screen options={{ title: novo ? "Novo perfil" : (perfil?.nome ?? "Perfil") }} />;
  if (!catalogo.data || (!novo && !perfil)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: cores.fundo, padding: espaco[4] }}>
        {titulo}
        {catalogo.error || perfis.error ? <Aviso tipo="erro" texto={errosDaApi(catalogo.error ?? perfis.error).geral ?? ""} /> : <ActivityIndicator color={cores.primaria} size="large" />}
      </View>
    );
  }

  return (
    <TelaFormulario
      rodape={
        somenteLeitura ? (
          <Botao texto="Voltar" onPress={() => router.back()} flex />
        ) : (
          <>
            <Botao texto="Cancelar" onPress={() => router.back()} flex />
            <Botao texto={perfil ? "Salvar alterações" : "Criar perfil"} variante="primaria" onPress={enviar} carregando={salvar.isPending} flex />
          </>
        )
      }
    >
      {titulo}
      {somenteLeitura && (
        <Aviso tipo="info" texto="O perfil Administrador é fixo: tem sempre todas as permissões, inclusive o módulo Administração, e não pode ser alterado nem excluído." />
      )}
      {daApi.geral && <Aviso tipo="erro" texto={daApi.geral} />}
      {excluir.error && <Aviso tipo="erro" texto={errosDaApi(excluir.error).geral ?? ""} />}

      <CampoTexto
        rotulo="Nome"
        obrigatorio
        value={nome}
        maxLength={50}
        editable={!somenteLeitura}
        onChangeText={(v) => {
          setErroNome(undefined);
          salvar.reset();
          setNome(v);
        }}
        erro={erroNome ?? daApi.campos.nome}
      />
      <CampoTexto rotulo="Descrição" value={descricao} maxLength={255} editable={!somenteLeitura} onChangeText={setDescricao} erro={daApi.campos.descricao} />

      <View style={{ gap: espaco[2] }}>
        <Text style={estilos.tituloMatriz}>Permissões · {somenteLeitura ? "todas" : `${marcadas.size} marcada(s)`}</Text>
        {catalogo.data.modulos.map((m) => {
          const itens = porModulo.get(m.id) ?? [];
          if (!itens.length) return null;
          const qtd = itens.filter((p) => marcado(p.codigo)).length;
          const expandido = aberto === m.id;
          return (
            <View key={m.id} style={[estilos.modulo, expandido && { borderColor: cores.primaria }]}>
              <Pressable
                onPress={() => setAberto(expandido ? null : m.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: expandido }}
                accessibilityLabel={`${m.nome}: ${qtd} de ${itens.length} permissões`}
                style={({ pressed }) => [estilos.cabecalhoModulo, pressed && { backgroundColor: cores.fundo2 }]}
              >
                <Text style={estilos.nomeModulo}>{m.nome}</Text>
                <Text style={[estilos.contagem, qtd > 0 && { color: cores.primariaSuaveTexto, backgroundColor: cores.primariaSuave }]}>
                  {qtd}/{itens.length}
                </Text>
                <View style={{ transform: [{ rotate: expandido ? "90deg" : "0deg" }] }}>
                  <Icone nome="chevronRight" tamanho={18} cor={cores.textoSuave} />
                </View>
              </Pressable>
              {expandido && (
                <View style={estilos.corpoModulo}>
                  {itens.map((p) => (
                    <Interruptor
                      key={p.codigo}
                      rotulo={p.acao === "outra" ? (p.descricao ?? p.codigo) : nomeAcao(p.acao)}
                      ajuda={p.acao === "outra" ? undefined : (p.descricao ?? undefined)}
                      valor={marcado(p.codigo)}
                      desabilitado={somenteLeitura}
                      onAlterar={() => alternar(p.codigo)}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
        <Text style={estilos.nota}>Só aparecem as ações que o sistema verifica em cada módulo (ex.: planos não são excluídos, são arquivados — faz parte de “Editar”).</Text>
      </View>

      {perfil && !somenteLeitura && <Botao texto="Excluir perfil" variante="perigo" icone="alert" onPress={confirmarExclusao} carregando={excluir.isPending} />}
    </TelaFormulario>
  );
}

const estilos = estilosDinamicos(() => ({
  tituloMatriz: { fontSize: fonte.md, fontWeight: "700", color: cores.texto },
  modulo: { borderWidth: 1, borderColor: cores.borda, borderRadius: raio.lg, backgroundColor: cores.superficie, overflow: "hidden" },
  cabecalhoModulo: { flexDirection: "row", alignItems: "center", gap: espaco[3], minHeight: 56, paddingHorizontal: espaco[4] },
  nomeModulo: { flex: 1, fontSize: fonte.base, fontWeight: "700", color: cores.texto },
  contagem: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    textAlign: "center",
    fontSize: fonte.xs,
    fontWeight: "800",
    color: cores.textoSuave,
    backgroundColor: cores.fundo2,
    fontVariant: ["tabular-nums"],
  },
  corpoModulo: { gap: espaco[2], padding: espaco[3], paddingTop: 0 },
  nota: { fontSize: fonte.xs, color: cores.textoSutil, lineHeight: escalarTexto(16) },
}));
