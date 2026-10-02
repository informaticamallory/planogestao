"""Painéis configuráveis por usuário (Dashboard e Indicadores): grid de widgets.

Sempre do usuário logado; salvar/restaurar exige a permissão de ver a tela. Não é auditado: é preferência visual,
não altera dados de negócio. O GET devolve também o catálogo (dados, visualizações compatíveis e
tamanhos), para o front montar o "+ Adicionar widget" e o "Alterar tipo de gráfico" sem duplicar regras.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Usuario
from app.services.preferencias_service import (
    CATALOGO,
    COLUNAS,
    PERMISSAO_TELA,
    Layout,
    PreferenciasService,
    Tela,
    Visualizacao,
    Widget,
)

router = APIRouter(prefix="/preferencias", tags=["preferencias"])

UsuarioLogado = Annotated[Usuario, Depends(get_current_user)]


class PosicaoWidget(BaseModel):
    x: int = Field(ge=0, le=COLUNAS - 1, description="Coluna (0 a 11).")
    y: int = Field(ge=0, le=1000, description="Linha.")


class TamanhoWidget(BaseModel):
    largura_colunas: int = Field(ge=1, le=COLUNAS)
    altura_linhas: int = Field(ge=1, le=24)


class WidgetLayout(BaseModel):
    id: str = Field(max_length=40, description="Id da instância no painel (o mesmo dado pode aparecer mais de uma vez).")
    tipo_dado: str = Field(max_length=60)
    tipo_visualizacao: Visualizacao
    posicao: PosicaoWidget
    tamanho: TamanhoWidget
    visivel: bool = True


class SalvarLayout(BaseModel):
    widgets: list[WidgetLayout] = Field(max_length=60, description="Configuração completa do painel.")


class DadoCatalogo(BaseModel):
    tipo_dado: str
    titulo: str
    visualizacoes: list[Visualizacao] = Field(description="Compatíveis com o dado; a primeira é a sugerida.")
    tamanho_padrao: TamanhoWidget
    tamanho_minimo: TamanhoWidget


class LayoutTela(BaseModel):
    tela: Tela
    personalizado: bool = Field(description="False = nunca personalizou (ou restaurou): painel padrão.")
    colunas: int = COLUNAS
    widgets: list[WidgetLayout]
    catalogo: list[DadoCatalogo]


def _svc(tela: Tela, usuario: Usuario, db: Session, alterar: bool = True) -> PreferenciasService:
    # Ler o layout não expõe dado de negócio (ex.: a aba Indicadores da equipe o usa); alterar exige ver a tela.
    if alterar and PERMISSAO_TELA[tela] not in usuario.codigos_permissao:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado para o seu perfil.")
    return PreferenciasService(db, usuario)


def _saida(layout: Layout) -> LayoutTela:
    return LayoutTela(
        tela=layout.tela,
        personalizado=layout.personalizado,
        widgets=[
            WidgetLayout(
                id=w.id,
                tipo_dado=w.tipo_dado,
                tipo_visualizacao=w.tipo_visualizacao,
                posicao=PosicaoWidget(x=w.x, y=w.y),
                tamanho=TamanhoWidget(largura_colunas=w.largura, altura_linhas=w.altura),
                visivel=w.visivel,
            )
            for w in layout.widgets
        ],
        catalogo=[
            DadoCatalogo(
                tipo_dado=d.tipo,
                titulo=d.titulo,
                visualizacoes=list(d.visualizacoes),
                tamanho_padrao=TamanhoWidget(largura_colunas=d.padrao[0], altura_linhas=d.padrao[1]),
                tamanho_minimo=TamanhoWidget(largura_colunas=d.minimo[0], altura_linhas=d.minimo[1]),
            )
            for d in CATALOGO[layout.tela].values()
        ],
    )


@router.get("/{tela}", response_model=LayoutTela)
def obter(tela: Tela, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Painel salvo do usuário, ou o padrão pré-definido se ele nunca personalizou."""
    return _saida(_svc(tela, usuario, db, alterar=False).obter(tela))


@router.put("/{tela}", response_model=LayoutTela)
def salvar(tela: Tela, dados: SalvarLayout, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Salva a configuração completa. 422 se um dado não existir na tela, a visualização não for
    compatível com o dado, o tamanho estiver fora dos limites ou widgets visíveis se sobrepuserem."""
    widgets = [
        Widget(
            id=w.id,
            tipo_dado=w.tipo_dado,
            tipo_visualizacao=w.tipo_visualizacao,
            x=w.posicao.x,
            y=w.posicao.y,
            largura=w.tamanho.largura_colunas,
            altura=w.tamanho.altura_linhas,
            visivel=w.visivel,
        )
        for w in dados.widgets
    ]
    return _saida(_svc(tela, usuario, db).salvar(tela, widgets))


@router.delete("/{tela}", response_model=LayoutTela)
def restaurar(tela: Tela, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Restaurar padrão: remove a personalização e devolve o painel padrão."""
    return _saida(_svc(tela, usuario, db).restaurar(tela))
