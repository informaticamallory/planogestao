"""Equipes. Leitura: `equipes:ver`. Criar/editar/excluir equipes e membros: `equipes:gerenciar`."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Equipe, EquipeMembro, Usuario
from app.routers.indicadores import CumprimentoPrazo, ContagemStatus, IndicadoresGerais, PontoMensal, ResponsavelPendencias
from app.routers.params import resolver_periodo_ou_422
from app.schemas.comum import Opcao, Pagina
from app.services.equipes_service import DadosEquipe, EquipesService
from app.services.periodo import Periodo, TipoPeriodo

router = APIRouter(prefix="/equipes", tags=["equipes"])

UsuarioLeitura = Annotated[Usuario, Depends(require_permission("equipes:ver"))]
UsuarioGestao = Annotated[Usuario, Depends(require_permission("equipes:gerenciar"))]


def _svc(db: Session, usuario: Usuario) -> EquipesService:
    return EquipesService(db, usuario, hoje_local())


def periodo_query(
    periodo: TipoPeriodo = TipoPeriodo.ANO, data_inicio: date | None = None, data_fim: date | None = None
) -> Periodo:
    """Mesmo padrão da tela de Indicadores ("ano"), para os números da listagem e da aba baterem."""
    return resolver_periodo_ou_422(periodo, data_inicio, data_fim)


PeriodoEquipeDep = Annotated[Periodo, Depends(periodo_query)]


# ---- schemas -----------------------------------------------------------------------------------


class EquipeSalvar(BaseModel):
    nome: str = Field(max_length=100)
    area_id: int
    setor_id: int | None = None
    supervisor_id: int
    descricao: str | None = Field(default=None, max_length=2000)
    ativo: bool = True

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return v

    @field_validator("descricao")
    @classmethod
    def _descricao(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class EquipeItem(BaseModel):
    id: int
    nome: str
    area: Opcao
    setor: Opcao | None
    supervisor: Opcao
    descricao: str | None
    ativo: bool
    membros: int
    desempenho: float | None = Field(description="% de ações no prazo das ações dos membros, no período.")


class MembroEquipe(BaseModel):
    usuario_id: int
    nome: str
    email: str
    avatar_url: str | None
    perfil: str
    area: str | None
    setor: str | None
    ativo: bool
    papel_na_equipe: str | None
    data_entrada: date


class AdicionarMembros(BaseModel):
    usuario_ids: list[int] = Field(min_length=1, max_length=100)
    papel_na_equipe: str | None = Field(default=None, max_length=60)

    @field_validator("papel_na_equipe")
    @classmethod
    def _papel(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class AtualizarMembro(BaseModel):
    papel_na_equipe: str | None = Field(default=None, max_length=60)

    @field_validator("papel_na_equipe")
    @classmethod
    def _papel(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class ResultadoMembros(BaseModel):
    adicionados: list[int]
    ja_membros: list[int] = Field(description="Já estavam na equipe (ignorados).")


class IndicadoresEquipe(BaseModel):
    membros: int
    gerais: IndicadoresGerais
    planos_por_status: list[ContagemStatus]
    planos_por_prazo: list[ContagemStatus]
    acoes_por_status: list[ContagemStatus]
    cumprimento_prazo: CumprimentoPrazo
    evolucao_mensal: list[PontoMensal]
    responsaveis_com_pendencias: list[ResponsavelPendencias]


def _item(e: Equipe, membros: int, desempenho: float | None) -> EquipeItem:
    return EquipeItem(
        id=e.id,
        nome=e.nome,
        area=Opcao(id=e.area.id, nome=e.area.nome),
        setor=Opcao(id=e.setor.id, nome=e.setor.nome) if e.setor else None,
        supervisor=Opcao(id=e.supervisor.id, nome=e.supervisor.nome),
        descricao=e.descricao,
        ativo=e.ativo,
        membros=membros,
        desempenho=desempenho,
    )


def _membro(m: EquipeMembro) -> MembroEquipe:
    u = m.usuario
    return MembroEquipe(
        usuario_id=u.id, nome=u.nome, email=u.email, avatar_url=u.avatar_url, perfil=u.perfil.nome,
        area=u.area.nome if u.area else None, setor=u.setor.nome if u.setor else None, ativo=u.ativo,
        papel_na_equipe=m.papel_na_equipe, data_entrada=m.data_entrada,
    )


def _dados(c: EquipeSalvar) -> DadosEquipe:
    return DadosEquipe(nome=c.nome, area_id=c.area_id, setor_id=c.setor_id, supervisor_id=c.supervisor_id, descricao=c.descricao, ativo=c.ativo)


# ---- endpoints ---------------------------------------------------------------------------------


@router.get("", response_model=Pagina[EquipeItem])
def listar(
    usuario: UsuarioLeitura,
    periodo: PeriodoEquipeDep,
    q: Annotated[str, Query(max_length=100, description="Busca no nome da equipe e do supervisor.")] = "",
    area_id: int | None = None,
    ativo: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    svc = _svc(db, usuario)
    equipes, total = svc.listar(q, area_id, ativo, page, page_size)
    contagem = svc.contagem_membros([e.id for e in equipes])
    return Pagina[EquipeItem](
        items=[_item(e, contagem.get(e.id, 0), svc.desempenho(e.id, periodo)) for e in equipes],
        total=total, page=page, page_size=page_size,
    )


@router.post("", response_model=EquipeItem, status_code=status.HTTP_201_CREATED)
def criar(corpo: EquipeSalvar, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    equipe = _svc(db, usuario).criar(_dados(corpo))
    return _item(equipe, 0, None)


@router.get("/{equipe_id}", response_model=EquipeItem)
def detalhe(equipe_id: int, usuario: UsuarioLeitura, periodo: PeriodoEquipeDep, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    equipe = svc.obter(equipe_id)
    return _item(equipe, len(svc.membros_ids(equipe_id)), svc.desempenho(equipe_id, periodo))


@router.put("/{equipe_id}", response_model=EquipeItem)
def atualizar(equipe_id: int, corpo: EquipeSalvar, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    equipe = svc.atualizar(equipe_id, _dados(corpo))
    return _item(equipe, len(svc.membros_ids(equipe_id)), None)


@router.delete("/{equipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir(equipe_id: int, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    _svc(db, usuario).excluir(equipe_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{equipe_id}/membros", response_model=list[MembroEquipe])
def membros(equipe_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    return [_membro(m) for m in _svc(db, usuario).membros(equipe_id)]


@router.post("/{equipe_id}/membros", response_model=ResultadoMembros)
def adicionar_membros(equipe_id: int, corpo: AdicionarMembros, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    """Adiciona um ou vários usuários (todos com o mesmo papel). Quem já é membro é ignorado."""
    return _svc(db, usuario).adicionar_membros(equipe_id, corpo.usuario_ids, corpo.papel_na_equipe)


@router.put("/{equipe_id}/membros/{usuario_id}", response_model=MembroEquipe)
def atualizar_membro(equipe_id: int, usuario_id: int, corpo: AtualizarMembro, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    return _membro(_svc(db, usuario).atualizar_membro(equipe_id, usuario_id, corpo.papel_na_equipe))


@router.delete("/{equipe_id}/membros/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_membro(equipe_id: int, usuario_id: int, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    _svc(db, usuario).remover_membro(equipe_id, usuario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{equipe_id}/indicadores", response_model=IndicadoresEquipe)
def indicadores(
    equipe_id: int,
    usuario: UsuarioLeitura,
    periodo: PeriodoEquipeDep,
    limite: Annotated[int, Query(ge=1, le=50, description="Máximo de responsáveis com pendências.")] = 10,
    db: Session = Depends(get_db),
):
    """Mesmos cálculos dos Indicadores (Fase 9), com o recorte: planos e ações cujo responsável é membro."""
    return _svc(db, usuario).indicadores(equipe_id, periodo, limite)
