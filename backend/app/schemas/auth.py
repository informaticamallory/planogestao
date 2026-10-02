from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Preferências de aparência do próprio usuário (tela Meu Perfil).
TemaPreferido = Literal["claro", "escuro", "automatico"]
# Paleta fechada do DS (contraste validado nos dois temas); None = laranja Mallory padrão.
CorDestaque = Literal["azul", "verde", "roxo", "petroleo"]
TamanhoFonte = Literal["pequeno", "padrao", "grande", "extra_grande"]


class LoginRequest(BaseModel):
    # Sem validação de formato no login: basta comparar com o que está cadastrado.
    email: str = Field(min_length=1, max_length=255)
    senha: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalizar(cls, v: str) -> str:
        return v.strip().lower()


class RefreshRequest(BaseModel):
    """Usado pelo app mobile. O app web envia o refresh token via cookie httpOnly."""

    refresh_token: str | None = None


class ReferenciaSimples(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class UsuarioLogado(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    avatar_url: str | None
    perfil: ReferenciaSimples
    area: ReferenciaSimples | None
    setor: ReferenciaSimples | None
    permissoes: list[str]
    tema: TemaPreferido
    cor_destaque: CorDestaque | None
    tamanho_fonte: TamanhoFonte


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Validade do access token, em segundos.")
    refresh_token: str | None = Field(
        default=None,
        description="Preenchido apenas para clientes mobile (header X-Client-Type: mobile). "
        "No web, o refresh token vai somente no cookie httpOnly.",
    )
    usuario: UsuarioLogado
