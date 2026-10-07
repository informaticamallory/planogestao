"""Equipes de trabalho vinculadas a planos. Leitura: `equipes:ver`. Criar/editar/excluir: `equipes:gerenciar`
(e gerir o plano: ver EquipesService). As regras ficam no serviço; a tela só reflete `pode_gerenciar`."""

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import como_utc, hoje_local
from app.models import Equipe, EquipeHistorico, EquipeMembro, PlanoDeAcao, Usuario
from app.schemas.comum import Opcao, Pagina
from app.services.equipes_service import DadosEquipe, EquipesService, FiltrosEquipes

router = APIRouter(prefix="/equipes", tags=["equipes"])

UsuarioLeitura = Annotated[Usuario, Depends(require_permission("equipes:ver"))]
UsuarioGestao = Annotated[Usuario, Depends(require_permission("equipes:gerenciar"))]


def _svc(db: Session, usuario: Usuario) -> EquipesService:
    return EquipesService(db, usuario, hoje_local())


# ---- schemas -----------------------------------------------------------------------------------


class EquipeSalvar(BaseModel):
    nome: str = Field(max_length=100)
    plano_id: int | None = Field(default=None, description="Obrigatório na criação. Na edição, só equipes sem plano podem receber um.")
    descricao: str | None = Field(default=None, max_length=2000, description="Descrição / objetivo da equipe.")
    participantes: list[int] = Field(default_factory=list, max_length=200, description="IDs dos usuários (sem repetição).")
    coordenador_id: int = Field(description="Um dos participantes. Papel interno: não altera o perfil de acesso.")
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


class SituacaoEquipe(BaseModel):
    ativo: bool


class PlanoDaEquipe(BaseModel):
    id: int
    codigo: str
    nome: str
    arquivado: bool


class EquipeItem(BaseModel):
    id: int
    nome: str
    descricao: str | None
    ativo: bool
    plano: PlanoDaEquipe | None = Field(description="Nulo: equipe antiga, sem plano vinculado.")
    area: Opcao = Field(description="Área do plano (ou do cadastro antigo, se não houver plano).")
    coordenador: Opcao
    total_participantes: int
    pode_gerenciar: bool = Field(description="Editar, ativar/inativar e excluir (o backend revalida).")
    somente_leitura: str | None = Field(description="Motivo de não aceitar alterações (ex.: plano arquivado).")
    criado_por: Opcao | None
    criado_em: datetime
    atualizado_em: datetime


class ParticipanteEquipe(BaseModel):
    usuario_id: int
    nome: str
    email: str
    avatar_url: str | None
    perfil: str
    area: str | None
    funcao_cargo: str | None
    ativo: bool
    convite_pendente: bool
    coordenador: bool
    papel_na_equipe: str | None
    data_entrada: date


class EquipeDetalhe(EquipeItem):
    participantes: list[ParticipanteEquipe]


class EventoEquipe(BaseModel):
    id: int
    evento: str
    descricao: str
    autor: Opcao | None
    criado_em: datetime


class PlanoOpcaoEquipe(BaseModel):
    id: int
    codigo: str
    nome: str
    area: Opcao


class CandidatoEquipe(BaseModel):
    id: int
    nome: str
    email: str
    avatar_url: str | None
    area: str | None
    funcao_cargo: str | None


class ResumoDesempenho(BaseModel):
    total: int
    concluidas: int
    concluidas_no_prazo: int
    concluidas_com_atraso: int
    em_aberto: int
    em_atraso: int
    percentual_no_prazo: float | None


class DesempenhoParticipante(ResumoDesempenho):
    usuario_id: int
    nome: str


class DesempenhoEquipe(BaseModel):
    disponivel: bool
    criterio: str = Field(description="O que entra no cálculo (exibido na tela).")
    plano_arquivado: bool
    acoes_do_plano: int = Field(description="Ações principais válidas do plano (todas, de qualquer responsável).")
    geral: ResumoDesempenho
    participantes: list[DesempenhoParticipante]


class NoParticipante(BaseModel):
    usuario_id: int = Field(description="O mesmo usuário em todas as equipes de que participa.")
    nome: str
    funcao_cargo: str | None
    ativo: bool
    coordenador: bool = Field(description="Papel interno da equipe; não há chefia entre os participantes.")
    corresponde_busca: bool = Field(description="Atende ao filtro de participante (para destacar).")


class NoEquipe(BaseModel):
    id: int
    nome: str
    descricao: str | None
    ativo: bool
    area: Opcao
    total_participantes: int
    pode_gerenciar: bool
    somente_leitura: str | None
    participantes: list[NoParticipante] = Field(description="Coordenador e demais participantes, por nome.")


class NoPlano(BaseModel):
    plano: PlanoDaEquipe | None = Field(description="Nulo: grupo das equipes sem plano vinculado.")
    gestor: Opcao | None = Field(description="Responsável pelo plano.")
    area: Opcao | None
    pode_criar_equipe: bool
    total_pessoas: int = Field(description="Pessoas distintas nas equipes exibidas deste plano.")
    equipes: list[NoEquipe]


class ArvoreEquipes(BaseModel):
    planos: list[NoPlano]
    total_equipes: int = Field(description="Equipes que atendem aos filtros.")
    total_pessoas: int = Field(description="Pessoas distintas (quem está em várias equipes conta uma vez).")
    truncado: bool = Field(description="Há mais equipes do que o limite da árvore: refine os filtros.")


def _opcao(u: Usuario | None) -> Opcao | None:
    return Opcao(id=u.id, nome=u.nome) if u is not None else None


def _item(svc: EquipesService, e: Equipe, total: int) -> dict:
    p: PlanoDeAcao | None = e.plano
    return dict(
        id=e.id,
        nome=e.nome,
        descricao=e.descricao,
        ativo=e.ativo,
        plano=PlanoDaEquipe(id=p.id, codigo=p.codigo, nome=p.nome, arquivado=p.arquivado_em is not None) if p else None,
        area=Opcao(id=p.area.id, nome=p.area.nome) if p else Opcao(id=e.area.id, nome=e.area.nome),
        coordenador=_opcao(e.coordenador),
        total_participantes=total,
        pode_gerenciar=svc.pode_gerenciar(e) and svc.somente_leitura(e) is None,
        somente_leitura=svc.somente_leitura(e),
        criado_por=_opcao(e.criado_por),
        criado_em=como_utc(e.criado_em),
        atualizado_em=como_utc(e.atualizado_em),
    )


def _participante(m: EquipeMembro, coordenador_id: int) -> ParticipanteEquipe:
    u = m.usuario
    return ParticipanteEquipe(
        usuario_id=u.id, nome=u.nome, email=u.email, avatar_url=u.avatar_url, perfil=u.perfil.nome,
        area=u.area.nome if u.area else None, funcao_cargo=u.setor.nome if u.setor else None, ativo=u.ativo,
        convite_pendente=u.convite_pendente, coordenador=u.id == coordenador_id, papel_na_equipe=m.papel_na_equipe,
        data_entrada=m.data_entrada,
    )


def _detalhe(svc: EquipesService, e: Equipe) -> EquipeDetalhe:
    participantes = svc.participantes(e)
    return EquipeDetalhe(
        **_item(svc, e, len(participantes)), participantes=[_participante(m, e.coordenador_id) for m in participantes]
    )


def _dados(c: EquipeSalvar) -> DadosEquipe:
    return DadosEquipe(
        nome=c.nome, plano_id=c.plano_id, descricao=c.descricao, participantes=tuple(c.participantes),
        coordenador_id=c.coordenador_id, ativo=c.ativo,
    )


# ---- endpoints ---------------------------------------------------------------------------------


def filtros_query(
    q: Annotated[str, Query(max_length=100, description="Busca no nome da equipe.")] = "",
    plano: Annotated[str, Query(max_length=100, description="Busca no código ou no nome do plano.")] = "",
    participante: Annotated[str, Query(max_length=100, description="Nome ou e-mail de um participante.")] = "",
    plano_id: int | None = None,
    area_id: Annotated[int | None, Query(description="Área do plano.")] = None,
    situacao: Literal["ativas", "inativas", "sem_plano"] | None = None,
    planos: Annotated[
        Literal["todos", "ativos", "arquivados"], Query(description="Planos ativos, arquivados (consulta histórica) ou todos.")
    ] = "todos",
) -> FiltrosEquipes:
    return FiltrosEquipes(q=q, plano=plano, participante=participante, plano_id=plano_id, area_id=area_id, situacao=situacao, planos=planos)


FiltrosDep = Annotated[FiltrosEquipes, Depends(filtros_query)]


@router.get("", response_model=Pagina[EquipeItem])
def listar(
    usuario: UsuarioLeitura,
    filtros: FiltrosDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    svc = _svc(db, usuario)
    equipes, total = svc.listar(filtros, page, page_size)
    contagem = svc.contagem_membros([e.id for e in equipes])
    return Pagina[EquipeItem](
        items=[EquipeItem(**_item(svc, e, contagem.get(e.id, 0))) for e in equipes], total=total, page=page, page_size=page_size
    )


@router.get("/arvore", response_model=ArvoreEquipes)
def arvore(usuario: UsuarioLeitura, filtros: FiltrosDep, db: Session = Depends(get_db)):
    """Plano → equipes → participantes (Equipes › Árvore), com os mesmos filtros e a mesma visibilidade da lista.
    Representação das equipes de trabalho: não cria hierarquia entre participantes nem muda perfis ou responsáveis."""
    svc = _svc(db, usuario)
    r = svc.arvore(filtros)
    planos = []
    for g in r["grupos"]:
        p: PlanoDeAcao | None = g["plano"]
        planos.append(NoPlano(
            plano=PlanoDaEquipe(id=p.id, codigo=p.codigo, nome=p.nome, arquivado=p.arquivado_em is not None) if p else None,
            gestor=_opcao(p.responsavel) if p else None,
            area=Opcao(id=p.area.id, nome=p.area.nome) if p else None,
            pode_criar_equipe=g["pode_criar_equipe"],
            total_pessoas=len(g["pessoas"]),
            equipes=[
                NoEquipe(
                    id=x["equipe"].id, nome=x["equipe"].nome, descricao=x["equipe"].descricao, ativo=x["equipe"].ativo,
                    area=Opcao(id=x["equipe"].area.id, nome=x["equipe"].area.nome),
                    total_participantes=len(x["participantes"]),
                    pode_gerenciar=svc.pode_gerenciar(x["equipe"]) and svc.somente_leitura(x["equipe"]) is None,
                    somente_leitura=svc.somente_leitura(x["equipe"]),
                    participantes=[
                        NoParticipante(
                            usuario_id=m.usuario.id, nome=m.usuario.nome,
                            funcao_cargo=m.usuario.setor.nome if m.usuario.setor else None, ativo=m.usuario.ativo,
                            coordenador=m.usuario_id == x["equipe"].coordenador_id,
                            corresponde_busca=m.usuario_id in x["correspondem"],
                        )
                        for m in x["participantes"]
                    ],
                )
                for x in g["equipes"]
            ],
        ))
    return ArvoreEquipes(planos=planos, total_equipes=r["total_equipes"], total_pessoas=r["total_pessoas"], truncado=r["truncado"])


@router.post("", response_model=EquipeDetalhe, status_code=status.HTTP_201_CREATED)
def criar(corpo: EquipeSalvar, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    return _detalhe(svc, svc.criar(_dados(corpo)))


@router.get("/opcoes/planos", response_model=list[PlanoOpcaoEquipe])
def opcoes_planos(
    usuario: UsuarioGestao,
    q: Annotated[str, Query(max_length=100, description="Código ou nome do plano.")] = "",
    plano_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Planos ativos cujas equipes o usuário gerencia (responsável, autor ou "Editar planos", nas áreas autorizadas)."""
    return [
        PlanoOpcaoEquipe(id=p.id, codigo=p.codigo, nome=p.nome, area=Opcao(id=p.area.id, nome=p.area.nome))
        for p in _svc(db, usuario).planos_gerenciaveis(q, plano_id)
    ]


@router.get("/opcoes/participantes", response_model=list[CandidatoEquipe])
def opcoes_participantes(
    usuario: UsuarioGestao,
    plano_id: int | None = None,
    equipe_id: Annotated[int | None, Query(description="Equipe sem plano vinculado (usa a área dela).")] = None,
    q: Annotated[str, Query(max_length=100, description="Nome ou e-mail.")] = "",
    db: Session = Depends(get_db),
):
    """Contas ativas, sem convite pendente, com "Visualizar planos" e a área do plano entre as autorizadas."""
    return [
        CandidatoEquipe(
            id=u.id, nome=u.nome, email=u.email, avatar_url=u.avatar_url,
            area=u.area.nome if u.area else None, funcao_cargo=u.setor.nome if u.setor else None,
        )
        for u in _svc(db, usuario).candidatos(plano_id, equipe_id, q)
    ]


@router.get("/{equipe_id}", response_model=EquipeDetalhe)
def detalhe(equipe_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    return _detalhe(svc, svc.obter(equipe_id))


@router.put("/{equipe_id}", response_model=EquipeDetalhe)
def atualizar(equipe_id: int, corpo: EquipeSalvar, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    return _detalhe(svc, svc.atualizar(equipe_id, _dados(corpo)))


@router.patch("/{equipe_id}/situacao", response_model=EquipeItem)
def alterar_situacao(equipe_id: int, corpo: SituacaoEquipe, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    svc = _svc(db, usuario)
    equipe = svc.alterar_situacao(equipe_id, corpo.ativo)
    return EquipeItem(**_item(svc, equipe, svc.contagem_membros([equipe.id]).get(equipe.id, 0)))


@router.delete("/{equipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir(equipe_id: int, usuario: UsuarioGestao, db: Session = Depends(get_db)):
    """Exclusão lógica. Plano, ações, responsáveis e usuários não mudam."""
    _svc(db, usuario).excluir(equipe_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{equipe_id}/historico", response_model=list[EventoEquipe])
def historico(equipe_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    eventos: list[EquipeHistorico] = _svc(db, usuario).historico(equipe_id)
    return [
        EventoEquipe(id=h.id, evento=h.evento, descricao=h.descricao, autor=_opcao(h.autor), criado_em=como_utc(h.criado_em))
        for h in eventos
    ]


@router.get("/{equipe_id}/desempenho", response_model=DesempenhoEquipe)
def desempenho(equipe_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    """Só as ações principais do plano vinculado atribuídas aos participantes (critério no campo `criterio`)."""
    return _svc(db, usuario).desempenho(equipe_id)
