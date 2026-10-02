from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "PlanoGestão API"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"
    # Fuso usado para "hoje", períodos e agrupamentos. O banco guarda datas/horas em UTC.
    TIMEZONE: str = "America/Sao_Paulo"

    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str
    DB_PASS: str = ""
    DB_NAME: str

    JWT_SECRET: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    # Validade do access token, em minutos.
    JWT_EXPIRATION: int = 15
    REFRESH_TOKEN_EXPIRATION_DAYS: int = 7

    # Cookie do refresh token (usado pelo app web).
    REFRESH_COOKIE_NAME: str = "pg_refresh"
    REFRESH_COOKIE_PATH: str = "/auth"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "strict"

    # Lista separada por vírgula.
    CORS_ORIGINS: str = "http://localhost:5173"

    # Job de alertas de prazo (ação vencendo/atrasada, plano vencendo). 0 desliga.
    ALERTAS_INTERVALO_MIN: int = 15

    # Push (Expo Push Service). O access token é opcional: só é exigido se "Enhanced Security for
    # Push Notifications" estiver ligado no projeto Expo.
    PUSH_HABILITADO: bool = True
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    EXPO_ACCESS_TOKEN: str | None = None

    # E-mail de notificação (criação de PA, ação e sub-item). Desligado por padrão: os envios ficam
    # registrados como "desabilitado" e nada sai. Credenciais só aqui (variáveis de ambiente).
    EMAIL_HABILITADO: bool = False
    # smtp = servidor real; arquivo = grava .eml em EMAIL_PASTA_ARQUIVOS (homologação/testes, nada sai).
    EMAIL_MODO: Literal["smtp", "arquivo"] = "smtp"
    EMAIL_REMETENTE: str | None = None
    EMAIL_REMETENTE_NOME: str = "Planos de Ação"
    EMAIL_PASTA_ARQUIVOS: str = "emails"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USUARIO: str | None = None
    SMTP_SENHA: str | None = None
    SMTP_SEGURANCA: Literal["starttls", "ssl", "nenhuma"] = "starttls"
    SMTP_TIMEOUT_S: int = 20
    # Tentativas por e-mail (com espera crescente entre elas) e intervalo do job que reenvia pendentes.
    EMAIL_MAX_TENTATIVAS: int = 5
    EMAIL_INTERVALO_MIN: int = 1
    # Endereço do app web: base dos links "Acessar no sistema".
    WEB_URL: str = "http://localhost:5173"

    # Anexos: pasta local (relativa ao diretório do backend) e limite por arquivo.
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 10

    @field_validator("JWT_EXPIRATION", "REFRESH_TOKEN_EXPIRATION_DAYS")
    @classmethod
    def _positivo(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("deve ser maior que zero")
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def database_url(self) -> URL:
        return URL.create(
            "mysql+pymysql",
            username=self.DB_USER,
            password=self.DB_PASS,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
            query={"charset": "utf8mb4"},
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
