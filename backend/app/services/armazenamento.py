"""Armazenamento de arquivos. Hoje em disco local; a interface permite trocar por S3/MinIO."""

from pathlib import Path
from typing import BinaryIO, Protocol

from app.core.config import get_settings


class Armazenamento(Protocol):
    def salvar(self, chave: str, conteudo: BinaryIO) -> None: ...
    def caminho_local(self, chave: str) -> Path: ...
    def remover(self, chave: str) -> None: ...


class ArmazenamentoLocal:
    def __init__(self, raiz: Path):
        self.raiz = raiz.resolve()

    def _resolver(self, chave: str) -> Path:
        caminho = (self.raiz / chave).resolve()
        # Defesa contra path traversal: a chave nunca pode sair da raiz.
        if not caminho.is_relative_to(self.raiz):
            raise ValueError("Chave de armazenamento inválida.")
        return caminho

    def salvar(self, chave: str, conteudo: BinaryIO) -> None:
        destino = self._resolver(chave)
        destino.parent.mkdir(parents=True, exist_ok=True)
        with destino.open("wb") as arquivo:
            while bloco := conteudo.read(1024 * 1024):
                arquivo.write(bloco)

    def caminho_local(self, chave: str) -> Path:
        return self._resolver(chave)

    def remover(self, chave: str) -> None:
        self._resolver(chave).unlink(missing_ok=True)


def obter_armazenamento() -> Armazenamento:
    return ArmazenamentoLocal(Path(get_settings().UPLOAD_DIR))
