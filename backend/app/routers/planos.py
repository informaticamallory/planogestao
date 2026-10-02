from contextlib import contextmanager
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Usuario
from app.models.enums import Prioridade
from app.services.regras import TagPrazo
from app.repositories.plano_repository import FiltrosPlanos, Ordenacao
from app.routers.params import PeriodoOpcionalDep
from app.schemas.comum import Opcao, Pagina
from app.schemas.plano import (
    AcaoCriar,
    AcaoDoPlano,
    AcoesAdicionadas,
    AnexoResumo,
    EventoTimeline,
    FiltroArquivados,
    FormatoExportacao,
    IndicadoresPlano,
    OpcoesPlanos,
    OrdenacaoPlano,
    PlanoAtualizado,
    PlanoAtualizar,
    PlanoCriado,
    PlanoCriar,
    PlanoDetalhe,
    PlanoListaItem,
    PlanoResumo,
    StatusFiltroPlano,
)
from app.services.armazenamento import obter_armazenamento
from app.services.plano_escrita_service import PlanoEscritaService, RegraNegocio, SemPermissao
from app.services.plano_service import ExportacaoGrandeDemais, PlanoNaoEncontrado, PlanoService

router = APIRouter(prefix="/planos", tags=["planos"])

# Endpoints de alteração exigem só `planos:ver` aqui; a regra fina (edição/autoria, status,
# arquivamento) fica no service, que responde 403/422 conforme o caso.
UsuarioLeitura = Annotated[Usuario, Depends(require_permission("planos:ver"))]


def filtros_query(
    periodo: PeriodoOpcionalDep,
    q: Annotated[str | None, Query(max_length=100, description="Busca em nome e código.")] = None,
    status_: Annotated[list[StatusFiltroPlano], Query(alias="status")] = [],  # noqa: B006
    prazo: Annotated[
        list[TagPrazo], Query(description="Situação do prazo do fim estimado (independente do status).")
    ] = [],  # noqa: B006
    rascunho: Annotated[bool | None, Query(description="true = só rascunhos; false = só liberados.")] = None,
    prioridade: Annotated[list[Prioridade], Query()] = [],  # noqa: B006
    responsavel_id: int | None = None,
    area_id: int | None = None,
    setor_id: int | None = None,
    tipo_id: int | None = None,
    origem_id: int | None = None,
    equipe_id: Annotated[int | None, Query(description="Planos cujo responsável é membro da equipe.")] = None,
    meus: bool = False,
    arquivados: Annotated[
        FiltroArquivados, Query(description="Exibição: excluir = ativos (padrão), somente = arquivados, incluir = todos.")
    ] = FiltroArquivados.EXCLUIR,
) -> FiltrosPlanos:
    return FiltrosPlanos(
        busca=q or None,
        status=status_,
        prazo=prazo,
        rascunho=rascunho,
        prioridade=prioridade,
        responsavel_id=responsavel_id,
        area_id=area_id,
        setor_id=setor_id,
        tipo_id=tipo_id,
        origem_id=origem_id,
        equipe_id=equipe_id,
        periodo=periodo,
        meus=meus,
        arquivados=arquivados,
    )


def ordenacao_query(
    ordenar: OrdenacaoPlano = OrdenacaoPlano.CRIADO_EM,
    direcao: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
) -> Ordenacao:
    return Ordenacao(campo=ordenar, decrescente=direcao == "desc")


FiltrosDep = Annotated[FiltrosPlanos, Depends(filtros_query)]
OrdenacaoDep = Annotated[Ordenacao, Depends(ordenacao_query)]


def _service(db: Session, usuario: Usuario) -> PlanoService:
    return PlanoService(db, usuario, hoje_local())


def _escrita(db: Session, usuario: Usuario) -> PlanoEscritaService:
    return PlanoEscritaService(db, usuario, hoje_local())


@router.get(
    "",
    response_model=Pagina[PlanoListaItem],
    responses={
        200: {
            "description": "JSON paginado, ou o arquivo quando `formato` é informado.",
            "content": {
                "text/csv": {},
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                "application/pdf": {},
            },
        }
    },
)
def listar(
    filtros: FiltrosDep,
    ordenacao: OrdenacaoDep,
    usuario: UsuarioLeitura,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    formato: Annotated[
        FormatoExportacao | None, Query(description="Se informado, exporta todos os resultados filtrados.")
    ] = None,
    db: Session = Depends(get_db),
):
    service = _service(db, usuario)
    if formato is None:
        return service.listar(filtros, ordenacao, page, page_size)

    try:
        arquivo = service.exportar(filtros, ordenacao, formato)
    except ExportacaoGrandeDemais as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    return Response(
        content=arquivo.conteudo,
        media_type=arquivo.media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(arquivo.nome)}"},
    )


@contextmanager
def _erros_de_servico():
    """Converte exceções de serviço em respostas HTTP padronizadas."""
    try:
        yield
    except PlanoNaoEncontrado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plano não encontrado.") from None
    except SemPermissao:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não pode alterar este plano.") from None
    except RegraNegocio as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


@router.get("/{plano_id}", response_model=PlanoDetalhe)
def detalhe(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    """Dados completos do plano, com indicadores e as permissões do usuário logado sobre ele."""
    with _erros_de_servico():
        return _service(db, usuario).detalhe(plano_id)


@router.put("/{plano_id}", response_model=PlanoAtualizado)
def atualizar(plano_id: int, dados: PlanoAtualizar, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    """Edição completa (etapas 1 e 2 + status). Cada campo alterado vai para o histórico do plano."""
    with _erros_de_servico():
        return _escrita(db, usuario).atualizar(plano_id, dados)


@router.get("/{plano_id}/resumo", response_model=PlanoResumo)
def resumo(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _service(db, usuario).resumo(plano_id)


@router.get("/{plano_id}/indicadores", response_model=IndicadoresPlano)
def indicadores(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _service(db, usuario).indicadores(plano_id)


@router.get("/{plano_id}/acoes", response_model=list[AcaoDoPlano])
def acoes_do_plano(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _service(db, usuario).acoes(plano_id)


@router.get("/{plano_id}/historico", response_model=Pagina[EventoTimeline])
def historico(
    plano_id: int,
    usuario: UsuarioLeitura,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    db: Session = Depends(get_db),
):
    """Linha do tempo consolidada do plano, das ações e dos anexos (mais recente primeiro)."""
    with _erros_de_servico():
        return _service(db, usuario).historico(plano_id, page, page_size)


@router.post("/{plano_id}/arquivar", response_model=PlanoDetalhe)
def arquivar(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _escrita(db, usuario).arquivar(plano_id, True)


@router.post("/{plano_id}/desarquivar", response_model=PlanoDetalhe)
def desarquivar(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _escrita(db, usuario).arquivar(plano_id, False)


# ---- criação, ações e anexos -----------------------------------------------------------

UsuarioCriacao = Annotated[Usuario, Depends(require_permission("planos:criar"))]


@router.post("", response_model=PlanoCriado, status_code=status.HTTP_201_CREATED)
def criar(dados: PlanoCriar, usuario: UsuarioCriacao, db: Session = Depends(get_db)):
    """Cria o plano (etapas 1 e 2) e, opcionalmente, suas ações (etapa 3) numa única transação."""
    with _erros_de_servico():
        return _escrita(db, usuario).criar(dados)


@router.post("/{plano_id}/acoes", response_model=AcoesAdicionadas, status_code=status.HTTP_201_CREATED)
def adicionar_acoes(
    plano_id: int,
    acoes: Annotated[AcaoCriar | list[AcaoCriar], Body(description="Uma ação ou uma lista (até 100).")],
    usuario: UsuarioLeitura,
    db: Session = Depends(get_db),
):
    lista = acoes if isinstance(acoes, list) else [acoes]
    if not 1 <= len(lista) <= 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Envie de 1 a 100 ações.")
    with _erros_de_servico():
        return _escrita(db, usuario).adicionar_acoes(plano_id, lista)


@router.post("/{plano_id}/anexos", response_model=list[AnexoResumo], status_code=status.HTTP_201_CREATED)
def enviar_anexos(
    plano_id: int,
    arquivos: Annotated[list[UploadFile], File(description="Até 10 arquivos por envio.")],
    usuario: UsuarioLeitura,
    db: Session = Depends(get_db),
):
    with _erros_de_servico():
        return _escrita(db, usuario).enviar_anexos(plano_id, arquivos, obter_armazenamento())


@router.get("/{plano_id}/anexos", response_model=list[AnexoResumo])
def listar_anexos(plano_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        return _escrita(db, usuario).listar_anexos(plano_id)


@router.get("/{plano_id}/anexos/{anexo_id}", response_class=FileResponse)
def baixar_anexo(plano_id: int, anexo_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros_de_servico():
        anexo = _escrita(db, usuario).obter_anexo(plano_id, anexo_id)
    caminho = obter_armazenamento().caminho_local(anexo.chave_armazenamento)
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado no armazenamento.")
    # Sempre como download + nosniff: o navegador nunca renderiza o arquivo como página.
    return FileResponse(
        caminho,
        media_type=anexo.mime_type,
        filename=anexo.nome_arquivo,
        headers={"X-Content-Type-Options": "nosniff"},
    )


opcoes_router = APIRouter(prefix="/opcoes", tags=["opcoes"])


@opcoes_router.get("/planos", response_model=OpcoesPlanos)
def opcoes_planos(usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    return _service(db, usuario).opcoes()


# Formulário do plano: só as origens compatíveis com o tipo escolhido (Administração › Tipos de Plano).
tipos_router = APIRouter(prefix="/tipos-plano", tags=["opcoes"])


@tipos_router.get("/{tipo_id}/origens", response_model=list[Opcao])
def origens_do_tipo(tipo_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    try:
        return _service(db, usuario).origens_do_tipo(tipo_id)
    except PlanoNaoEncontrado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tipo de plano não encontrado.") from None
