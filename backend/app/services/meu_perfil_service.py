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

from app.core.foto import AJUSTE_PADRAO
from app.models import Usuario
from app.services.armazenamento import Armazenamento
from app.services.erros import RegraInvalida

# Foto: aceita JPEG/PNG/WebP de até 5 MB. Guarda a foto INTEIRA (sem recorte nem filtro; só a rotação do EXIF
# corrigida e os metadados/GPS descartados), em duas versões WebP: a de exibição (lado maior até 640 px, usada nos
# avatares) e a "original" (até 2048 px, usada no editor de enquadramento). O recorte é só visual (core/foto.py),
# então reajustar nunca acumula cortes nem perde qualidade.
FOTO_MAX_BYTES = 5 * 1024 * 1024
FOTO_FORMATOS = {"JPEG", "PNG", "WEBP"}
FOTO_LADO_EXIBICAO = 640
FOTO_LADO_ORIGINAL = 2048
FOTO_MAX_PIXELS = 40_000_000  # defesa contra "bomba de descompressão"
PASTA_FOTOS = "avatares"
PREFIXO_URL_FOTO = "/usuarios/fotos/"
SUFIXO_ORIGINAL = "-original"
# Fotos antigas (antes do enquadramento) são quadrados de 256 px, sem a versão "-original".
NOME_FOTO = re.compile(r"^[0-9a-f]{32}(-original)?\.webp$")


@dataclass(frozen=True)
class DadosPerfil:
    """Campos enviados (None = não enviado). `cor_destaque` usa `limpar_cor` para voltar ao padrão."""

    nome: str | None = None
    tema: str | None = None
    tamanho_fonte: str | None = None
    cor_destaque: str | None = None
    limpar_cor: bool = False


def _webp(img: Image.Image, lado: int, qualidade: int) -> bytes:
    copia = img.copy()
    copia.thumbnail((lado, lado), Image.Resampling.LANCZOS)  # mantém a proporção; nunca amplia
    saida = io.BytesIO()
    copia.save(saida, "WEBP", quality=qualidade, method=6)  # save sem exif: metadados descartados
    return saida.getvalue()


def processar_foto(conteudo: BinaryIO) -> tuple[bytes, bytes]:
    """Valida pelo conteúdo (não pela extensão/Content-Type) e corrige a rotação. Devolve (exibição, original),
    as duas com a foto inteira e a proporção original."""
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
            return _webp(img, FOTO_LADO_EXIBICAO, 85), _webp(img, FOTO_LADO_ORIGINAL, 90)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise RegraInvalida("Não foi possível ler a imagem. Envie um JPEG, PNG ou WebP válido.") from None


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

    def trocar_foto(self, conteudo: BinaryIO, armazenamento: Armazenamento, ajuste: dict | None = None) -> Usuario:
        """Foto nova + o enquadramento feito no editor antes de enviar (sem ele, o padrão). Trocar a foto sempre
        começa um ajuste novo: o anterior não é reaproveitado."""
        exibicao, original = processar_foto(conteudo)
        # Nome novo a cada troca: a URL muda, então o cache do navegador nunca mostra a foto antiga.
        base = uuid.uuid4().hex
        armazenamento.salvar(f"{PASTA_FOTOS}/{base}.webp", io.BytesIO(exibicao))
        armazenamento.salvar(f"{PASTA_FOTOS}/{base}{SUFIXO_ORIGINAL}.webp", io.BytesIO(original))
        anteriores = self._arquivos_proprios()
        self.usuario.avatar_arquivo = f"{PREFIXO_URL_FOTO}{base}.webp"
        self.usuario.avatar_ajuste = {**(ajuste or AJUSTE_PADRAO), "original": True}
        self.db.commit()
        for nome in anteriores:
            armazenamento.remover(f"{PASTA_FOTOS}/{nome}")
        return self.usuario

    def ajustar_foto(self, ajuste: dict) -> Usuario:
        """Só o enquadramento (formato, encaixe, posição, zoom): a imagem guardada não muda."""
        if not self.usuario.avatar_arquivo:
            raise RegraInvalida("Envie uma foto antes de ajustar o enquadramento.")
        tem_original = bool((self.usuario.avatar_ajuste or {}).get("original"))
        self.usuario.avatar_ajuste = {**ajuste, **({"original": True} if tem_original else {})}
        self.db.commit()
        return self.usuario

    def remover_foto(self, armazenamento: Armazenamento) -> Usuario:
        """Remove a foto e o enquadramento: volta o avatar padrão (iniciais)."""
        anteriores = self._arquivos_proprios()
        self.usuario.avatar_arquivo = None
        self.usuario.avatar_ajuste = None
        self.db.commit()
        for nome in anteriores:
            armazenamento.remover(f"{PASTA_FOTOS}/{nome}")
        return self.usuario

    def _arquivos_proprios(self) -> list[str]:
        """Arquivos da foto atual, se enviada por aqui (uma URL externa cadastrada pelo admin não é apagada)."""
        nome = _nome_proprio(self.usuario.avatar_arquivo)
        if not nome:
            return []
        return [nome, nome.removesuffix(".webp") + f"{SUFIXO_ORIGINAL}.webp"]


def _nome_proprio(url: str | None) -> str | None:
    if url and url.startswith(PREFIXO_URL_FOTO):
        nome = url.removeprefix(PREFIXO_URL_FOTO)
        return nome if NOME_FOTO.match(nome) and SUFIXO_ORIGINAL not in nome else None
    return None


def url_original(usuario: Usuario) -> str | None:
    """Imagem para o editor: a versão "-original" das fotos novas; nas antigas (ou URL externa), a própria foto."""
    if not usuario.avatar_arquivo:
        return None
    nome = _nome_proprio(usuario.avatar_arquivo)
    if nome and (usuario.avatar_ajuste or {}).get("original"):
        return PREFIXO_URL_FOTO + nome.removesuffix(".webp") + f"{SUFIXO_ORIGINAL}.webp"
    return usuario.avatar_arquivo
