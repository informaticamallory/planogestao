import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, TextInput, View } from "react-native";
import { Text } from "react-native";

import { AvisoErro } from "../../../../../components/AvisoErro";
import { ChipsUnico } from "../../../../../components/Escolhas";
import { BotaoNovo, ItemAdmin, estilosAdmin } from "../../../../../components/admin/UiAdmin";
import { useUsuariosAdmin } from "../../../../../hooks/useAdmin";
import { useAuthStore } from "../../../../../store/authStore";
import { cores, espaco, estilosDinamicos, fonte, raio } from "../../../../../theme";
import { formatarDataHora, formatarNumero } from "../../../../../utils/formatos";

type Situacao = "ativos" | "inativos";

export default function UsuariosAdmin() {
  const router = useRouter();
  const eu = useAuthStore((s) => s.usuario);
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [situacao, setSituacao] = useState<Situacao | undefined>(undefined);
  const [puxando, setPuxando] = useState(false);

  // Mesma espera do web antes de consultar (não busca a cada tecla).
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useUsuariosAdmin({ q: q || undefined, ativo: situacao === "ativos" ? true : situacao === "inativos" ? false : undefined });
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.items) ?? [], [lista.data]);
  const total = lista.data?.pages[0]?.total;

  const atualizar = async () => {
    setPuxando(true);
    try {
      await lista.refetch();
    } finally {
      setPuxando(false);
    }
  };

  return (
    <FlatList
      style={estilosAdmin.tela}
      contentContainerStyle={estilosAdmin.conteudo}
      data={itens}
      keyExtractor={(u) => String(u.id)}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item: u }) => (
        <ItemAdmin
          titulo={`${u.nome}${u.id === eu?.id ? " (você)" : ""}`}
          subtitulo={`${u.perfil.nome} · ${u.email}`}
          detalhe={`${u.area?.nome ?? "Sem área"}${u.setor ? ` / ${u.setor.nome}` : ""} · último acesso: ${u.ultimo_login_em ? formatarDataHora(u.ultimo_login_em) : "nunca"}`}
          ativo={u.ativo}
          onPress={() => router.push({ pathname: "/mais/admin/usuarios/[id]", params: { id: String(u.id) } })}
        />
      )}
      onEndReachedThreshold={0.4}
      onEndReached={() => lista.hasNextPage && !lista.isFetchingNextPage && void lista.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={atualizar} colors={[cores.primaria]} tintColor={cores.primaria} />}
      ListHeaderComponent={
        <View style={estilosAdmin.cabecalho}>
          <BotaoNovo texto="Novo usuário" onPress={() => router.push({ pathname: "/mais/admin/usuarios/[id]", params: { id: "novo" } })} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome ou e-mail"
            placeholderTextColor={cores.textoSutil}
            accessibilityLabel="Buscar usuários"
            autoCapitalize="none"
            autoCorrect={false}
            style={estilos.busca}
          />
          <ChipsUnico
            rotulo="Situação"
            vazio="Todos"
            valor={situacao}
            opcoes={[
              { valor: "ativos", rotulo: "Ativos" },
              { valor: "inativos", rotulo: "Inativos" },
            ]}
            onEscolher={setSituacao}
          />
          <Text style={estilosAdmin.texto}>
            {total === undefined ? "Carregando…" : `${formatarNumero(total)} usuário(s)`} · Usuários não são apagados: inativar bloqueia o acesso e encerra as sessões.
          </Text>
          {lista.error && !lista.data && <AvisoErro erro={lista.error} onTentar={() => void lista.refetch()} />}
        </View>
      }
      ListEmptyComponent={
        lista.isLoading ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} /> : lista.data ? <Text style={estilosAdmin.vazio}>Nenhum usuário com esses filtros.</Text> : null
      }
      ListFooterComponent={lista.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[4] }} /> : null}
    />
  );
}

const estilos = estilosDinamicos(() => ({
  busca: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espaco[3],
    fontSize: fonte.md,
    color: cores.texto,
    backgroundColor: cores.superficie,
  },
}));
