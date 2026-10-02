import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { AvisoErro } from "../../../../../components/AvisoErro";
import { BotaoNovo, ItemAdmin, estilosAdmin } from "../../../../../components/admin/UiAdmin";
import { usePerfisAdmin } from "../../../../../hooks/useAdmin";
import { cores, espaco } from "../../../../../theme";

export default function PerfisAdmin() {
  const router = useRouter();
  const perfis = usePerfisAdmin();
  const abrir = (id: string) => router.push({ pathname: "/mais/admin/perfis/[id]", params: { id } });

  return (
    <FlatList
      style={estilosAdmin.tela}
      contentContainerStyle={estilosAdmin.conteudo}
      data={perfis.data ?? []}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item: p }) => (
        <ItemAdmin
          titulo={p.nome}
          selo={p.editavel ? undefined : "Fixo"}
          subtitulo={`${p.usuarios} usuário(s) · ${p.editavel ? `${p.permissoes.length} permissão(ões)` : "acesso total"}`}
          detalhe={p.descricao ?? undefined}
          onPress={() => abrir(String(p.id))}
        />
      )}
      ListHeaderComponent={
        <View style={estilosAdmin.cabecalho}>
          <BotaoNovo texto="Novo perfil" onPress={() => abrir("novo")} />
          <Text style={estilosAdmin.texto}>
            O módulo Administração é exclusivo do perfil Administrador e não aparece na matriz de permissões.
          </Text>
          {perfis.error && <AvisoErro erro={perfis.error} onTentar={() => void perfis.refetch()} />}
        </View>
      }
      ListEmptyComponent={perfis.isLoading ? <ActivityIndicator color={cores.primaria} style={{ paddingVertical: espaco[8] }} /> : null}
    />
  );
}
