"""Configurações de e-mail (tela de Administração): modelos das notificações, CCO, prévia e teste.

Tudo exige o perfil Administrador. Remetente e credenciais (SMTP/Microsoft 365) vêm só das variáveis
de ambiente: aqui são apenas exibidos (sem senha), nunca editados.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.tempo import como_utc
from app.models import ConfigEmail, ModeloEmail, Usuario
from app.services import email_modelos as modelos
from app.services import email_notificacoes

router = APIRouter(prefix="/email-config", tags=["administracao"])
UsuarioAdmin = Annotated[Usuario, Depends(require_admin)]


class Remetente(BaseModel):
    endereco: str | None = Field(description="Remetente exclusivo do sistema (EMAIL_REMETENTE).")
    nome: str
    habilitado: bool = Field(description="Envio automático ligado (EMAIL_HABILITADO).")
    modo: str = Field(description="smtp | arquivo")
    servidor: str | None = Field(description="Servidor e segurança, sem credenciais.")
    configurado: bool = Field(description="Há remetente e servidor para enviar.")


class Variavel(BaseModel):
    nome: str
    descricao: str


class ModeloTela(BaseModel):
    evento: str
    nome: str
    assunto: str
    corpo: str
    cco: list[str]
    ativo: bool
    personalizado: bool = Field(description="False = texto padrão (nunca salvo).")
    padrao_assunto: str
    padrao_corpo: str
    variaveis: list[Variavel]
    atualizado_por: str | None
    atualizado_em: datetime | None


class CcoPadrao(BaseModel):
    enderecos: list[str]
    atualizado_por: str | None
    atualizado_em: datetime | None


class HistoricoItem(BaseModel):
    id: int
    escopo: str
    escopo_nome: str
    campo: str
    valor_anterior: str | None
    valor_novo: str | None
    usuario: str | None
    criado_em: datetime


class ConfigEmailTela(BaseModel):
    remetente: Remetente
    cco_padrao: CcoPadrao
    modelos: list[ModeloTela]
    historico: list[HistoricoItem]


class ModeloSalvar(BaseModel):
    assunto: str = Field(max_length=1000)
    corpo: str = Field(max_length=40_000)
    cco: list[str] = Field(default_factory=list, max_length=100)
    ativo: bool = True


class CcoSalvar(BaseModel):
    enderecos: list[str] = Field(default_factory=list, max_length=100)


class TextoModelo(BaseModel):
    evento: str
    assunto: str = Field(max_length=1000)
    corpo: str = Field(max_length=40_000)


class Previa(BaseModel):
    assunto: str
    html: str
    texto: str


class TestePedido(TextoModelo):
    destinatario: str = Field(max_length=255)


class ResultadoTeste(BaseModel):
    enviado: bool
    destinatario: str
    assunto: str
    erro: str | None


def _invalido(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))


def _remetente() -> Remetente:
    s = get_settings()
    if s.EMAIL_MODO == "arquivo":
        servidor, configurado = f"Arquivo .eml em “{s.EMAIL_PASTA_ARQUIVOS}” (nada é enviado)", True
    else:
        servidor = f"{s.SMTP_HOST}:{s.SMTP_PORT} ({s.SMTP_SEGURANCA})" if s.SMTP_HOST else None
        configurado = bool(s.SMTP_HOST and s.EMAIL_REMETENTE)
    return Remetente(
        endereco=s.EMAIL_REMETENTE, nome=s.EMAIL_REMETENTE_NOME, habilitado=s.EMAIL_HABILITADO, modo=s.EMAIL_MODO,
        servidor=servidor, configurado=configurado,
    )


def _modelo_tela(db: Session, evento: str) -> ModeloTela:
    d = modelos.CATALOGO[evento]
    efetivo = modelos.modelo_efetivo(db, evento)
    linha = db.get(ModeloEmail, evento)
    return ModeloTela(
        evento=evento, nome=d.nome, assunto=efetivo.assunto, corpo=efetivo.corpo, cco=efetivo.cco, ativo=efetivo.ativo,
        personalizado=efetivo.personalizado, padrao_assunto=d.assunto, padrao_corpo=d.corpo,
        variaveis=[Variavel(nome=n, descricao=t) for n, t in d.variaveis.items()],
        atualizado_por=linha.atualizado_por.nome if linha and linha.atualizado_por else None,
        atualizado_em=como_utc(linha.atualizado_em) if linha else None,
    )


def _cco_padrao(db: Session) -> CcoPadrao:
    c = db.get(ConfigEmail, modelos.CHAVE_CCO_PADRAO)
    return CcoPadrao(
        enderecos=list(c.valor or []) if c else [],
        atualizado_por=c.atualizado_por.nome if c and c.atualizado_por else None,
        atualizado_em=como_utc(c.atualizado_em) if c else None,
    )


@router.get("", response_model=ConfigEmailTela)
def obter(_: UsuarioAdmin, db: Session = Depends(get_db)):
    nomes = {**{e: d.nome for e, d in modelos.CATALOGO.items()}, modelos.CHAVE_CCO_PADRAO: "CCO padrão"}
    return ConfigEmailTela(
        remetente=_remetente(),
        cco_padrao=_cco_padrao(db),
        modelos=[_modelo_tela(db, e) for e in modelos.CATALOGO],
        historico=[
            HistoricoItem(
                id=h.id, escopo=h.escopo, escopo_nome=nomes.get(h.escopo, h.escopo), campo=h.campo, valor_anterior=h.valor_anterior,
                valor_novo=h.valor_novo, usuario=h.usuario.nome if h.usuario else None, criado_em=como_utc(h.criado_em),
            )
            for h in modelos.historico(db)
        ],
    )


@router.put("/modelos/{evento}", response_model=ModeloTela)
def salvar_modelo(evento: str, corpo: ModeloSalvar, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    """Salva assunto, corpo, CCO e ativação. Variáveis desconhecidas e endereços inválidos → 422."""
    if evento not in modelos.CATALOGO:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo inexistente.")
    try:
        modelos.salvar_modelo(db, evento, corpo.assunto, corpo.corpo, corpo.cco, corpo.ativo, admin)
    except modelos.ModeloInvalido as exc:
        raise _invalido(exc) from None
    return _modelo_tela(db, evento)


@router.put("/cco-padrao", response_model=CcoPadrao)
def salvar_cco_padrao(corpo: CcoSalvar, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    """CCO de TODAS as notificações (somado ao CCO de cada modelo, sem repetidos)."""
    try:
        modelos.salvar_cco_padrao(db, corpo.enderecos, admin)
    except modelos.ModeloInvalido as exc:
        raise _invalido(exc) from None
    return _cco_padrao(db)


@router.post("/previa", response_model=Previa)
def previa(corpo: TextoModelo, _: UsuarioAdmin):
    """Renderiza o texto informado (salvo ou não) com dados fictícios, pelo mesmo mecanismo do envio real.
    Não grava nada."""
    try:
        assunto, texto = modelos.validar_modelo(corpo.evento, corpo.assunto, corpo.corpo)
    except modelos.ModeloInvalido as exc:
        raise _invalido(exc) from None
    r = modelos.renderizar(assunto, texto, modelos.dados_ficticios(corpo.evento), corpo.evento)
    return Previa(assunto=r.assunto, html=r.html, texto=r.texto)


@router.post("/teste", response_model=ResultadoTeste)
def enviar_teste(corpo: TestePedido, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    """Envia agora, só para o endereço informado, com dados fictícios: sem destinatários reais nem CCO."""
    try:
        assunto, texto = modelos.validar_modelo(corpo.evento, corpo.assunto, corpo.corpo)
        destino = modelos.normalizar_cco([corpo.destinatario])
    except modelos.ModeloInvalido as exc:
        raise _invalido(exc) from None
    if len(destino) != 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe um endereço de e-mail para o teste.")
    if not _remetente().configurado:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Remetente/servidor de e-mail não configurado no servidor (variáveis EMAIL_* e SMTP_*)."
        )
    envio = email_notificacoes.enviar_teste(db, corpo.evento, destino[0], assunto, texto, admin)
    return ResultadoTeste(enviado=envio.situacao == "enviado", destinatario=destino[0], assunto=envio.assunto, erro=envio.ultimo_erro)
