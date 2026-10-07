"""Barramento de eventos de notificação (padrão observer).

Os services de negócio só PUBLICAM eventos; não conhecem canais de entrega.

- Canais internos (ex.: notificação no app) rodam dentro da transação: se ela sofrer rollback,
  a notificação some junto.
- Canais externos (e-mail, WhatsApp, webhook n8n...) recebem os eventos só DEPOIS do commit,
  para nunca avisar sobre algo que não foi gravado. Para plugar um canal:

      from app.services.eventos import registrar_canal_externo
      registrar_canal_externo(MeuCanalEmail())   # objeto com .enviar(evento)
"""

import logging
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.enums import ReferenciaNotificacao

logger = logging.getLogger("planogestao.eventos")


class TipoEvento:
    ACAO_ATRIBUIDA = "acao_atribuida"
    ACAO_VENCENDO = "acao_vencendo"
    ACAO_ATRASADA = "acao_atrasada"
    ACAO_CONCLUIDA = "acao_concluida"
    SOLICITACAO_PRAZO = "solicitacao_prazo"
    RESPOSTA_SOLICITACAO_PRAZO = "resposta_solicitacao_prazo"
    PLANO_VENCENDO = "plano_vencendo"
    PLANO_CONCLUIDO = "plano_concluido"
    # Avisos operacionais (services/avisos.py e avisos_agendados.py). ACAO_VENCENDO = "Prazo próximo".
    RESUMO_SEMANAL = "resumo_semanal"
    PRAZO_ALTERADO = "prazo_alterado"
    DEPENDENCIA_LIBERADA = "dependencia_liberada"
    PLANO_SEM_ATUALIZACAO = "plano_sem_atualizacao"

    TODOS = (
        ACAO_ATRIBUIDA, ACAO_VENCENDO, ACAO_ATRASADA, ACAO_CONCLUIDA,
        SOLICITACAO_PRAZO, RESPOSTA_SOLICITACAO_PRAZO, PLANO_VENCENDO, PLANO_CONCLUIDO,
        RESUMO_SEMANAL, PRAZO_ALTERADO, DEPENDENCIA_LIBERADA, PLANO_SEM_ATUALIZACAO,
    )


@dataclass(frozen=True)
class Evento:
    tipo: str
    destinatarios: tuple[int, ...]
    titulo: str
    mensagem: str
    referencia_tipo: ReferenciaNotificacao | None = None
    referencia_id: int | None = None
    # Quem causou o evento (não é notificado).
    autor_id: int | None = None
    # Evita repetir o mesmo alerta (ex.: job de prazos). Recebe o id do destinatário.
    chave_deduplicacao: str | None = None
    dados: dict = field(default_factory=dict, compare=False, hash=False)

    def destinatarios_efetivos(self) -> list[int]:
        vistos = dict.fromkeys(d for d in self.destinatarios if d is not None and d != self.autor_id)
        return list(vistos)


class CanalInterno(Protocol):
    def entregar(self, db: Session, evento: Evento) -> int:
        """Grava na transação atual. Retorna quantas notificações criou."""


class CanalExterno(Protocol):
    def enviar(self, evento: Evento) -> None:
        """Chamado após o commit. Falhas são registradas em log e não afetam o sistema."""


_canais_internos: list[CanalInterno] = []
_canais_externos: list[CanalExterno] = []
_CHAVE_PENDENTES = "eventos_pendentes"


def registrar_canal_interno(canal: CanalInterno) -> None:
    _canais_internos.append(canal)


def registrar_canal_externo(canal: CanalExterno) -> None:
    _canais_externos.append(canal)


def publicar(db: Session, evento: Evento) -> int:
    """Entrega o evento aos canais internos agora e agenda os externos para depois do commit."""
    criadas = sum(canal.entregar(db, evento) for canal in _canais_internos)
    if criadas and _canais_externos:
        db.info.setdefault(_CHAVE_PENDENTES, []).append(evento)
    return criadas


def publicar_varios(db: Session, eventos: Iterable[Evento]) -> int:
    return sum(publicar(db, e) for e in eventos)


@event.listens_for(Session, "after_commit")
def _despachar_externos(session: Session) -> None:
    pendentes = session.info.pop(_CHAVE_PENDENTES, [])
    for evento in pendentes:
        for canal in _canais_externos:
            try:
                canal.enviar(evento)
            except Exception:  # um canal com problema não pode derrubar os demais
                logger.exception("Falha ao enviar evento %s pelo canal %s", evento.tipo, type(canal).__name__)


@event.listens_for(Session, "after_rollback")
def _descartar_pendentes(session: Session) -> None:
    session.info.pop(_CHAVE_PENDENTES, None)


class CanalLog:
    """Canal externo de exemplo: registra em log o que seria enviado (e-mail/WhatsApp/n8n)."""

    def enviar(self, evento: Evento) -> None:
        logger.info("[canal-log] %s -> %s: %s", evento.tipo, evento.destinatarios_efetivos(), evento.titulo)
