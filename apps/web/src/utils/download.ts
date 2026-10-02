/** Dispara o download de um Blob no navegador. */
export function baixarArquivo(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoga depois do clique ser processado.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
