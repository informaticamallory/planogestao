import { useId, useRef, useState, type DragEvent } from "react";

import { Button } from "./Button";
import styles from "./FileDropzone.module.css";

// Mesmos limites do backend (plano_escrita_service.py / MAX_UPLOAD_MB).
export const EXTENSOES_ANEXO = [
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
  ".txt", ".csv", ".zip",
];
export const MAX_MB_ANEXO = 10;
export const MAX_ARQUIVOS = 10;

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i).toLowerCase() : "";
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

interface FileDropzoneProps {
  arquivos: File[];
  onAlterar: (arquivos: File[]) => void;
}

export function FileDropzone({ arquivos, onAlterar }: FileDropzoneProps) {
  const [arrastando, setArrastando] = useState(false);
  const [rejeitados, setRejeitados] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const erros: string[] = [];
    const novos = [...arquivos];
    for (const arquivo of Array.from(lista)) {
      if (!EXTENSOES_ANEXO.includes(extensao(arquivo.name))) erros.push(`${arquivo.name}: tipo não permitido.`);
      else if (arquivo.size > MAX_MB_ANEXO * 1024 * 1024) erros.push(`${arquivo.name}: maior que ${MAX_MB_ANEXO} MB.`);
      else if (arquivo.size === 0) erros.push(`${arquivo.name}: arquivo vazio.`);
      else if (novos.some((a) => a.name === arquivo.name && a.size === arquivo.size)) continue; // duplicado
      else if (novos.length >= MAX_ARQUIVOS) erros.push(`${arquivo.name}: limite de ${MAX_ARQUIVOS} arquivos.`);
      else novos.push(arquivo);
    }
    setRejeitados(erros);
    onAlterar(novos);
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    adicionar(e.dataTransfer.files);
  };

  return (
    <div className={styles.zonaUpload}>
      <div
        className={arrastando ? `${styles.area} ${styles.areaAtiva}` : styles.area}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <p className={styles.instrucao}>Arraste arquivos para cá ou</p>
        <Button onClick={() => input.current?.click()}>Selecionar arquivos</Button>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={EXTENSOES_ANEXO.join(",")}
          className={styles.inputOculto}
          onChange={(e) => {
            adicionar(e.target.files);
            e.target.value = ""; // permite selecionar o mesmo arquivo de novo após remover
          }}
        />
        <p className={styles.limites}>
          Até {MAX_ARQUIVOS} arquivos, {MAX_MB_ANEXO} MB cada. PDF, imagens, Office, TXT, CSV e ZIP.
        </p>
      </div>

      {rejeitados.length > 0 && (
        <ul className={styles.rejeitados} role="alert">
          {rejeitados.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {arquivos.length > 0 && (
        <ul className={styles.lista}>
          {arquivos.map((a, i) => (
            <li key={`${a.name}-${a.size}`} className={styles.item}>
              <span className={styles.nome}>{a.name}</span>
              <span className={styles.tamanho}>{formatarTamanho(a.size)}</span>
              <Button
                variante="link"
                className={styles.remover}
                onClick={() => onAlterar(arquivos.filter((_, j) => j !== i))}
                aria-label={`Remover ${a.name}`}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
