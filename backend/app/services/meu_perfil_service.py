"""Meu Perfil: o que o próprio usuário pode mudar na sua conta.

Só nome de exibição, aparência (tema, tamanho da fonte, cor de destaque) e foto. Perfil de acesso, área, setor, e-mail e situação ficam
exclusivamente com a Administração (admin_usuarios_service, perfil Administrador).
"""

import io
import re
import uuid
from dataclasses import dataclass
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models import Usuario
from app.services.armazenamento import Armazenamento
from app.services.erros import RegraInvalida

# Foto: aceita JPEG/PNG/WebP de até 5 MB; guarda sempre um quadrado WebP de 256 px (sem EXIF/GPS).
FOTO_MAX_BYTES = 5 * 1024 * 1024
FOTO_FORMATOS = {"JPEG", "PNG", "WEBP"}
FOTO_LADO = 256
FOTO_MAX_PIXELS = 40_000_000  # defesa contra "bomba de descompressão"
PASTA_FOTOS = "avatares"
PREFIXO_URL_FOTO = "/usuarios/fotos/"
NOME_FOTO = re.compile(r"^[0-9a-f]{32}\.webp$")


@dataclass(frozen=True)
class DadosPerfil:
    """Campos enviados (None = não enviado). `cor_destaque` usa `limpar_cor` para voltar ao padrão."""

    nome: str | None = None
    tema: str | None = None
    tamanho_fonte: str | None = None
    cor_destaque: str | None = None
    limpar_cor: bool = False


def processar_foto(conteudo: BinaryIO) -> bytes:
    """Valida pelo conteúdo (não pela extensão/Content-Type), corrige a rotação, recorta o centro e reduz."""
    bruto = conteudo.read(FOTO_MAX_BYTES + 1)
    if len(bruto) > FOTO_MAX_BYTES:
        raise RegraInvalida("A foto deve ter no máximo 5 MB.")
    if not bruto:
        raise RegraInvalida("Arquivo vazio.")
    try:
        with Image.open(io.BytesIO(bruto)) as img:
            if img.format not in FOTO_FORMATOS:
                raise RegraInvalida("Envie uma imagem JPEG, PNG ou WebP.")
            if img.width * img.height > FOTO_MAX_PIXELS:
                raise RegraInvalida("Imagem grande demais (máximo de 40 megapixels).")
            img.load()
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
            quadrado = ImageOps.fit(img, (FOTO_LADO, FOTO_LADO), Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise RegraInvalida("Não foi possível ler a imagem. Envie um JPEG, PNG ou WebP válido.") from None
    saida = io.BytesIO()
    quadrado.save(saida, "WEBP", quality=85, method=6)  # save sem exif: metadados descartados
    return saida.getvalue()


class MeuPerfilService:
    def __init__(self, db: Session, usuario: Usuario):
        self.db = db
        self.usuario = usuario

    def atualizar(self, dados: DadosPerfil) -> Usuario:
        u = self.usuario
        if dados.nome is not None:
            u.nome = dados.nome
        if dados.tema is not None:
            u.tema = dados.tema
        if dados.tamanho_fonte is not None:
            u.tamanho_fonte = dados.tamanho_fonte
        if dados.limpar_cor:
            u.cor_destaque = None
        elif dados.cor_destaque is not None:
            u.cor_destaque = dados.cor_destaque
        self.db.commit()
        return u

    def trocar_foto(self, conteudo: BinaryIO, armazenamento: Armazenamento) -> Usuario:
        webp = processar_foto(conteudo)
        # Nome novo a cada troca: a URL muda, então o cache do navegador nunca mostra a foto antiga.
        nome = f"{uuid.uuid4().hex}.webp"
        armazenamento.salvar(f"{PASTA_FOTOS}/{nome}", io.BytesIO(webp))
        anterior = self._arquivo_proprio(self.usuario.avatar_url)
        self.usuario.avatar_url = PREFIXO_URL_FOTO + nome
        self.db.commit()
        if anterior:
            armazenamento.remover(f"{PASTA_FOTOS}/{anterior}")
        return self.usuario

    def remover_foto(self, armazenamento: Armazenamento) -> Usuario:
        anterior = self._arquivo_proprio(self.usuario.avatar_url)
        self.usuario.avatar_url = None
        self.db.commit()
        if anterior:
            armazenamento.remover(f"{PASTA_FOTOS}/{anterior}")
        return self.usuario

    @staticmethod
    def _arquivo_proprio(url: str | None) -> str | None:
        """Nome do arquivo se a foto foi enviada por aqui (uma URL externa cadastrada pelo admin não é apagada)."""
        if url and url.startswith(PREFIXO_URL_FOTO):
            nome = url.removeprefix(PREFIXO_URL_FOTO)
            return nome if NOME_FOTO.match(nome) else None
        return None
