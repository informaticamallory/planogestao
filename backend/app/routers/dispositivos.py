"""Aparelhos do app mobile: registro do token de push (Expo)."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import DeviceToken, Usuario

router = APIRouter(prefix="/dispositivos", tags=["dispositivos"])

UsuarioLogado = Annotated[Usuario, Depends(get_current_user)]

_FORMATO_TOKEN = re.compile(r"^Expo(nent)?PushToken\[[^\]\s]{10,200}\]$")


class RegistrarToken(BaseModel):
    token: str = Field(max_length=255, description="Token do Expo: ExponentPushToken[...]")
    plataforma: Literal["android", "ios"]

    @field_validator("token")
    @classmethod
    def _formato(cls, v: str) -> str:
        v = v.strip()
        if not _FORMATO_TOKEN.match(v):
            raise ValueError("Token de push do Expo inválido.")
        return v


class RemoverToken(BaseModel):
    token: str = Field(max_length=255)


class ResultadoToken(BaseModel):
    ativo: bool


@router.post("/registrar-token", response_model=ResultadoToken)
def registrar_token(dados: RegistrarToken, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Chamado pelo app a cada login/abertura. Idempotente.

    Se o aparelho estava com outro usuário, o token passa para o usuário atual — o anterior deixa
    de receber push neste aparelho.
    """
    existente = db.scalar(select(DeviceToken).where(DeviceToken.token == dados.token))
    if existente is None:
        db.add(DeviceToken(usuario_id=usuario.id, token=dados.token, plataforma=dados.plataforma))
    else:
        existente.usuario_id = usuario.id
        existente.plataforma = dados.plataforma
        existente.ativo = True
    db.commit()
    return ResultadoToken(ativo=True)


@router.post("/remover-token", response_model=ResultadoToken)
def remover_token(dados: RemoverToken, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Chamado no logout: o aparelho para de receber push deste usuário."""
    db.execute(
        update(DeviceToken)
        .where(DeviceToken.token == dados.token.strip(), DeviceToken.usuario_id == usuario.id)
        .values(ativo=False)
    )
    db.commit()
    return ResultadoToken(ativo=False)
