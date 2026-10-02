import type { SetorItem } from "@planogestao/shared-types";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { Botao } from "../../../../../../components/Botao";
import { CampoTexto } from "../../../../../../components/Campos";
import { Escolha } from "../../../../../../components/Escolhas";
import { Aviso, Interruptor, TelaFormulario } from "../../../../../../components/admin/UiAdmin";
import { CADASTROS, ehTipoCadastro, useCadastro } from "../../../../../../components/admin/cadastros";
import { useMutacaoAdmin } from "../../../../../../hooks/useAdmin";
import { cores } from "../../../../../../theme";
import { errosDaApi } from "../../../../../../utils/errosApi";

export default function FormCadastro() {
  const router = useRouter();
  const { tipo, id, area_id } = useLocalSearchParams<{ tipo: string; id: string; area_id?: string }>();
  const valido = ehTipoCadastro(tipo);
  const { consulta, areas } = useCadastro(valido ? tipo : "areas");
  const novo = id === "novo";
  const item = novo ? null : (consulta.data?.find((i) => String(i.id) === id) ?? null);

  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [area, setArea] = useState<number | undefined>(area_id ? Number(area_id) : undefined);
  const [erroLocal, setErroLocal] = useState<{ nome?: string; area_id?: string }>({});

  useEffect(() => {
    if (item) {
      setNome(item.nome);
      setAtivo(item.ativo);
      if ("area_id" in item) setArea((item as SetorItem).area_id);
    }
  }, [item?.id]);

  const cfg = valido ? CADASTROS[tipo] : null;
  const salvar = useMutacaoAdmin((c: { nome: string; ativo: boolean; area_id?: number }) => cfg!.salvar(item?.id ?? null, c));
  const excluir = useMutacaoAdmin((i: number) => cfg!.excluir(i));
  if (!valido || !cfg) return <Redirect href="/mais/admin" />;

  const daApi = errosDaApi(salvar.error);
  const novoTexto = `${cfg.feminino ? "Nova" : "Novo"} ${cfg.rotulo}`;

  const enviar = () => {
    // Mesmas validações do web (CadastroSimples); o resto (duplicidade, em uso) vem da API.
    if (nome.trim().length < 2) return setErroLocal({ nome: "Informe um nome com pelo menos 2 caracteres." });
    if (tipo === "setores" && !area) return setErroLocal({ area_id: "Selecione a área do setor." });
    salvar.mutate(
      { nome: nome.trim(), ativo, ...(tipo === "setores" ? { area_id: area } : {}) },
      {
        onSuccess: () => {
          Alert.alert("Salvo", `${cfg.rotulo[0]!.toUpperCase()}${cfg.rotulo.slice(1)} “${nome.trim()}” salv${cfg.feminino ? "a" : "o"}.`);
          router.back();
        },
      },
    );
  };

  const confirmarExclusao = () =>
    item &&
    Alert.alert(`Excluir ${cfg.rotulo}`, `Excluir “${item.nome}”? Só é possível se não estiver em uso; caso esteja, inative para preservar o histórico.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir definitivamente", style: "destructive", onPress: () => excluir.mutate(item.id, { onSuccess: () => router.back() }) },
    ]);

  const titulo = <Stack.Screen options={{ title: novo ? novoTexto : `Editar ${cfg.rotulo}` }} />;
  if (!novo && !item) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: cores.fundo }}>
        {titulo}
        <ActivityIndicator color={cores.primaria} size="large" />
      </View>
    );
  }

  return (
    <TelaFormulario
      rodape={
        <>
          <Botao texto="Cancelar" onPress={() => router.back()} flex />
          <Botao texto="Salvar" variante="primaria" onPress={enviar} carregando={salvar.isPending} flex />
        </>
      }
    >
      {titulo}
      {daApi.geral && <Aviso tipo="erro" texto={daApi.geral} />}
      {excluir.error && <Aviso tipo="erro" texto={errosDaApi(excluir.error).geral ?? ""} />}
      <CampoTexto
        rotulo="Nome"
        obrigatorio
        value={nome}
        maxLength={100}
        autoFocus={novo}
        onChangeText={(v) => {
          setErroLocal({});
          salvar.reset();
          setNome(v);
        }}
        erro={erroLocal.nome ?? daApi.campos.nome}
      />
      {tipo === "setores" && (
        <View style={{ gap: 4 }}>
          <Escolha
            rotulo="Área *"
            todos="Selecione…"
            valor={area}
            opcoes={(areas.data ?? []).filter((a) => a.ativo || a.id === area).map((a) => ({ id: a.id, nome: a.ativo ? a.nome : `${a.nome} (inativa)` }))}
            onEscolher={(v) => {
              setErroLocal({});
              setArea(v);
            }}
          />
          {(erroLocal.area_id ?? daApi.campos.area_id) && <Aviso tipo="erro" texto={(erroLocal.area_id ?? daApi.campos.area_id)!} />}
          <Aviso tipo="info" texto="Um setor em uso não pode mudar de área." />
        </View>
      )}
      <Interruptor rotulo="Ativo" ajuda="Inativos não aparecem nas opções de novos cadastros." valor={ativo} onAlterar={setAtivo} />
      {item && <Botao texto={`Excluir ${cfg.rotulo}`} variante="perigo" icone="alert" onPress={confirmarExclusao} carregando={excluir.isPending} />}
    </TelaFormulario>
  );
}
