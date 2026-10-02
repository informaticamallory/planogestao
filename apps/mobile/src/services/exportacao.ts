/**
 * Exportação de relatórios no celular: o arquivo é gerado no backend (mesmos endpoints e mesma
 * URL do web — montada pelo api-client), baixado direto para o disco pelo download nativo e
 * entregue ao menu do sistema (compartilhar/salvar; imprimir sai por ali quando o aparelho oferece).
 */
import type { FormatoExportacao } from "@planogestao/shared-types";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { useAuthStore } from "../store/authStore";
import { api } from "./api";

const TIPOS: Record<FormatoExportacao, { mime: string; uti: string }> = {
  pdf: { mime: "application/pdf", uti: "com.adobe.pdf" },
  csv: { mime: "text/csv", uti: "public.comma-separated-values-text" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", uti: "org.openxmlformats.spreadsheetml.sheet" },
};

/** Pasta própria no cache (o sistema pode limpar); cada exportação apaga as anteriores. */
function pastaLimpa(): Directory {
  const pasta = new Directory(Paths.cache, "relatorios");
  if (pasta.exists) pasta.delete();
  pasta.create({ intermediates: true });
  return pasta;
}

async function baixar(url: string, destino: Directory): Promise<File> {
  const tentar = () =>
    File.downloadFileAsync(url, destino, {
      headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}` },
      idempotent: true,
    });
  try {
    return await tentar();
  } catch (erro) {
    // Access token vencido: renova pela mesma rotina do api-client e tenta de novo, uma vez.
    if (String(erro).includes("401") && (await api.auth.refresh())) return tentar();
    throw erro;
  }
}

export async function exportarECompartilhar(opcoes: {
  url: string;
  formato: FormatoExportacao;
  nomePadrao: string; // ex.: "planos" (se o nome do servidor não puder ser lido)
  titulo: string;
  /** Mesma exportação pelo fetch do api-client: usada só na falha, para obter a mensagem do servidor. */
  explicarErro: () => Promise<unknown>;
}): Promise<void> {
  const { url, formato, nomePadrao, titulo, explicarErro } = opcoes;
  let arquivo: File;
  try {
    arquivo = await baixar(url, pastaLimpa());
  } catch (erro) {
    // O download nativo não expõe o corpo do erro (ex.: 422 "exportação grande demais").
    await explicarErro();
    throw erro;
  }

  // O nome vem do Content-Disposition; se o aparelho não o usar, garante a extensão certa.
  if (!arquivo.name.toLowerCase().endsWith(`.${formato}`)) {
    const agora = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    arquivo.move(new File(arquivo.parentDirectory, `${nomePadrao}_${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}.${formato}`));
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("Este aparelho não oferece o menu de compartilhar.");
  await Sharing.shareAsync(arquivo.uri, { mimeType: TIPOS[formato].mime, UTI: TIPOS[formato].uti, dialogTitle: titulo });
}
