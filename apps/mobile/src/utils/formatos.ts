/** "2026-09-24" → "24/09/2026" (a data vem pronta do backend; sem conversão de fuso). */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** "2026-09-24" → "24/09". */
export function formatarDiaMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/** Timestamp UTC da API → "24/09/2026 14:30" no fuso do aparelho. */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date local (do date picker) → "2026-09-24", sem passar por UTC. */
export function paraIsoData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-09-24" → Date local à meia-noite (para o date picker). */
export function deIsoData(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano!, mes! - 1, dia!);
}

export function formatarPercentual(valor: number | null | undefined): string {
  return valor == null ? "—" : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}
