import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Ícones de traço do Mallory DS (mesmos desenhos do web, grade 24×24). */
const ICONES = {
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  userCheck: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 11l2 2 4-4",
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  bell: "M10.27 21a2 2 0 0 0 3.46 0 M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  listChecks: "M3 5h.01 M3 12h.01 M3 19h.01 M8 5h13 M8 12h13 M8 19h13",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  trophy: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22 M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22 M18 2H6v7a6 6 0 0 0 12 0V2z",
  barChart: "M12 20V10 M18 20V4 M6 20v-4",
  fileText: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v5h5 M16 13H8 M16 17H8 M10 9H8",
  shield: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  logOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chevronRight: "M9 18l6-6-6-6",
  wifiOff: "M12 20h.01 M8.5 16.43a5 5 0 0 1 7 0 M5 12.86a10 10 0 0 1 5.17-2.69 M19 12.86a10 10 0 0 0-2-1.52 M2 8.82a15 15 0 0 1 4.18-2.64 M22 8.82a15 15 0 0 0-11.29-3.76 M2 2l20 20",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  clock: "M12 6v6l4 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  refresh: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M3 21v-5h5",
} as const;

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, tamanho = 22, cor, espessura = 1.9 }: { nome: NomeIcone; tamanho?: number; cor: ColorValue; espessura?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round" strokeLinejoin="round">
      {ICONES[nome].split(" M").map((trecho, i) => (
        <Path key={i} d={(i ? "M" : "") + trecho} />
      ))}
    </Svg>
  );
}
