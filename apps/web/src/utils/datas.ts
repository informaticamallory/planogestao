/** Datas "YYYY-MM-DD" vêm da API sem fuso: são datas de calendário, não instantes. */
function partes(isoData: string): [number, number, number] {
  const [a, m, d] = isoData.split("-").map(Number);
  return [a ?? 0, (m ?? 1) - 1, d ?? 1];
}

export function paraData(isoData: string): Date {
  return new Date(...partes(isoData));
}

export function paraIsoData(data: Date): string {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtMesAno = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });
const fmtMesAnoLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const formatarData = (iso: string) => fmtData.format(paraData(iso));
export const formatarDiaMes = (iso: string) => fmtDiaMes.format(paraData(iso));
export const formatarMesAno = (iso: string) => fmtMesAno.format(paraData(iso));
/** "Setembro de 2026" (só a primeira letra maiúscula). */
export const formatarMesAnoLongo = (data: Date) => {
  const texto = fmtMesAnoLongo.format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
/** Instantes (ISO com fuso) são exibidos no horário local do navegador. */
export const formatarDataHora = (isoInstante: string) => fmtDataHora.format(new Date(isoInstante));
/** Só a data (local) de um instante ISO com fuso. */
export const formatarDataDoInstante = (isoInstante: string) => fmtData.format(new Date(isoInstante));

// ---- calendário (datas locais, semana de domingo a sábado) ---------------------------

export function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

/** Mesmo dia em outro mês; se o dia não existir (ex.: 31/02), usa o último do mês. */
export function somarMeses(data: Date, meses: number): Date {
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + meses + 1, 0).getDate();
  return new Date(data.getFullYear(), data.getMonth() + meses, Math.min(data.getDate(), ultimoDia));
}

export function inicioDaSemana(data: Date): Date {
  return somarDias(data, -data.getDay());
}

export function primeiroDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

export function ultimoDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth() + 1, 0);
}

/** Dias exibidos na grade mensal: semanas completas (domingo a sábado) que cobrem o mês. */
export function diasDaGradeMensal(data: Date): Date[] {
  const inicio = inicioDaSemana(primeiroDoMes(data));
  const fim = somarDias(inicioDaSemana(ultimoDoMes(data)), 6);
  const dias: Date[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
export const formatarDiaDaSemana = (iso: string) => {
  const texto = fmtDiaSemana.format(paraData(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function formatarRelativo(isoInstante: string, agora = Date.now()): string {
  const segundos = Math.round((new Date(isoInstante).getTime() - agora) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) return relativo.format(segundos, "second");
  if (abs < 3600) return relativo.format(Math.round(segundos / 60), "minute");
  if (abs < 86400) return relativo.format(Math.round(segundos / 3600), "hour");
  if (abs < 86400 * 30) return relativo.format(Math.round(segundos / 86400), "day");
  return formatarDataHora(isoInstante);
}

/** Texto da janela de "vencendo" (parâmetro dias_alerta_vencimento_acao). */
export function textoJanelaVencimento(dias: number): string {
  if (dias === 0) return "Prazo hoje";
  return dias === 1 ? "Prazo até amanhã" : `Prazo nos próximos ${dias} dias`;
}
