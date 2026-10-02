import { Redirect, Stack, useLocalSearchParams } from "expo-router";

import { TelaEmBreve } from "../../../components/TelaEmBreve";
import { MODULOS_MAIS } from "../../../navigation/modulos";
import { temPermissao, useAuthStore } from "../../../store/authStore";

export default function ModuloScreen() {
  const { modulo } = useLocalSearchParams<{ modulo: string }>();
  const usuario = useAuthStore((s) => s.usuario);
  const def = MODULOS_MAIS.find((m) => m.id === modulo);

  // Link direto (deep link) para módulo inexistente ou sem permissão: volta ao menu.
  if (!def || !temPermissao(usuario, def.permissao)) return <Redirect href="/mais" />;

  return (
    <>
      <Stack.Screen options={{ title: def.titulo }} />
      <TelaEmBreve titulo={def.titulo} descricao={def.descricao} icone={def.icone} />
    </>
  );
}
