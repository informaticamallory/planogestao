from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Usuario
from app.schemas.acao import (
    AcaoAtualizada,
    AcaoAtualizar,
    AcaoDetalhe,
    AcaoHistoricoItem,
    ReabrirAcao,
    ResponderSolicitacao,
    SolicitarAlteracao,
)
from app.schemas.plano import AcaoCriar, AcoesAdicionadas
from app.services.acao_service import AcaoNaoEncontrada, AcaoService, RegraAcao, SemPermissaoAcao

router = APIRouter(prefix="/acoes", tags=["acoes"])

# A regra fina (responsável/gestor, status, plano ativo) fica no service.
UsuarioLeitura = Annotated[Usuario, Depends(require_permission("planos:ver"))]


def _service(db: Session, usuario: Usuario) -> AcaoService:
    return AcaoService(db, usuario, hoje_local())


@contextmanager
def _erros():
    try:
        yield
    except AcaoNaoEncontrada:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ação não encontrada.") from None
    except SemPermissaoAcao:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você não pode fazer esta alteração na ação.") from None
    except RegraAcao as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


@router.get("/{acao_id}", response_model=AcaoDetalhe)
def detalhe(acao_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros():
        return _service(db, usuario).detalhe(acao_id)


@router.put("/{acao_id}", response_model=AcaoAtualizada)
def atualizar(acao_id: int, dados: AcaoAtualizar, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    """Atualiza status/progresso/prazo/observação. Cada campo alterado vai para o histórico."""
    with _erros():
        return _service(db, usuario).atualizar(acao_id, dados)


@router.post("/{acao_id}/reabrir", response_model=AcaoDetalhe)
def reabrir(acao_id: int, dados: ReabrirAcao, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    """Gestor reabre uma ação concluída (volta a em andamento). O status do plano é recalculado."""
    with _erros():
        return _service(db, usuario).reabrir(acao_id, dados)


@router.post("/{acao_id}/subacoes", response_model=AcoesAdicionadas, status_code=status.HTTP_201_CREATED)
def criar_subacoes(
    acao_id: int,
    itens: Annotated[list[AcaoCriar], Body(min_length=1, max_length=50)],
    usuario: UsuarioLeitura,
    db: Session = Depends(get_db),
):
    """Responsável pelo item (ou gestor) o desdobra em subações — em qualquer nível (1.1, 1.1.1…), com o
    mesmo corpo e as mesmas validações da inclusão de ações. Não dá ao responsável da subação acesso ao plano."""
    with _erros():
        return _service(db, usuario).criar_subacoes(acao_id, itens)


@router.get("/{acao_id}/historico", response_model=list[AcaoHistoricoItem])
def historico(acao_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros():
        return _service(db, usuario).historico(acao_id)


@router.post("/{acao_id}/aceitar", response_model=AcaoDetalhe)
def aceitar(acao_id: int, usuario: UsuarioLeitura, db: Session = Depends(get_db)):
    with _erros():
        return _service(db, usuario).aceitar(acao_id)


@router.post("/{acao_id}/solicitar-alteracao", response_model=AcaoDetalhe, status_code=status.HTTP_201_CREATED)
def solicitar_alteracao(
    acao_id: int, dados: SolicitarAlteracao, usuario: UsuarioLeitura, db: Session = Depends(get_db)
):
    with _erros():
        return _service(db, usuario).solicitar_alteracao(acao_id, dados)


@router.post("/{acao_id}/solicitacoes/{solicitacao_id}/responder", response_model=AcaoDetalhe)
def responder_solicitacao(
    acao_id: int,
    solicitacao_id: int,
    dados: ResponderSolicitacao,
    usuario: UsuarioLeitura,
    db: Session = Depends(get_db),
):
    with _erros():
        return _service(db, usuario).responder_solicitacao(acao_id, solicitacao_id, dados)

