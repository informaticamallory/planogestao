"""Push para o app mobile via Expo Push Service.

Fluxo: o canal de notificações no app (notificacao_service) agenda aqui cada notificação que
GRAVOU. Depois do commit, os envios saem numa thread de fundo — a requisição não espera o Expo,
e um rollback descarta o push junto com a notificação. Falhas vão só para o log.

Não há retentativa nem leitura de "receipts" (confirmação de entrega pelo FCM/APNs): o push é
um aviso; a notificação continua na aba Notificações de qualquer forma.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx
from sqlalchemy import event, func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import DeviceToken, Notificacao

logger = logging.getLogger("planogestao.push")

_CHAVE = "push_pendentes"
_LOTE = 100  # limite de mensagens por requisição do Expo
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="push")


@dataclass(frozen=True)
class PushPendente:
    notificacao_id: int
    usuario_id: int
    tipo: str
    titulo: str
    mensagem: str
    referencia_tipo: str | None
    referencia_id: int | None


def rota_da_referencia(referencia_tipo: str | None, referencia_id: int | None) -> str | None:
    """Rota do app (Expo Router) aberta ao tocar no push."""
    if referencia_id is None:
        return None
    if referencia_tipo == "acao":
        return f"/acoes/{referencia_id}"
    if referencia_tipo == "plano":
        return f"/planos/{referencia_id}"
    return None


def agendar_push(db: Session, notificacao: Notificacao) -> None:
    """Chamado com a notificação já no flush (tem id). Envia só se a transação for confirmada."""
    if not get_settings().PUSH_HABILITADO:
        return
    ref = notificacao.referencia_tipo
    db.info.setdefault(_CHAVE, []).append(
        PushPendente(
            notificacao_id=notificacao.id,
            usuario_id=notificacao.usuario_id,
            tipo=notificacao.tipo,
            titulo=notificacao.titulo,
            mensagem=notificacao.mensagem,
            referencia_tipo=ref.value if ref is not None else None,
            referencia_id=notificacao.referencia_id,
        )
    )


@event.listens_for(Session, "after_commit")
def _apos_commit(session: Session) -> None:
    pendentes = session.info.pop(_CHAVE, [])
    if pendentes:
        _executor.submit(_enviar_seguro, pendentes)


@event.listens_for(Session, "after_rollback")
def _apos_rollback(session: Session) -> None:
    session.info.pop(_CHAVE, None)


def _enviar_seguro(pendentes: list[PushPendente]) -> None:
    try:
        enviar(pendentes)
    except Exception:
        logger.exception("Falha ao enviar %d push(es)", len(pendentes))


def montar_mensagens(db: Session, pendentes: list[PushPendente]) -> list[dict]:
    usuarios = {p.usuario_id for p in pendentes}
    tokens: dict[int, list[str]] = {}
    for usuario_id, token in db.execute(
        select(DeviceToken.usuario_id, DeviceToken.token).where(DeviceToken.usuario_id.in_(usuarios), DeviceToken.ativo.is_(True))
    ):
        tokens.setdefault(usuario_id, []).append(token)
    if not tokens:
        return []
    # Badge do ícone (iOS e launchers Android que suportam) = não lidas do usuário.
    nao_lidas = dict(
        db.execute(
            select(Notificacao.usuario_id, func.count())
            .where(Notificacao.usuario_id.in_(tokens.keys()), Notificacao.lida.is_(False))
            .group_by(Notificacao.usuario_id)
        ).all()
    )
    mensagens = []
    for p in pendentes:
        for token in tokens.get(p.usuario_id, []):
            mensagens.append(
                {
                    "to": token,
                    "title": p.titulo,
                    "body": p.mensagem,
                    "sound": "default",
                    "priority": "high",
                    "channelId": "default",
                    "badge": int(nao_lidas.get(p.usuario_id, 0)),
                    "data": {
                        "notificacao_id": p.notificacao_id,
                        "tipo": p.tipo,
                        "referencia_tipo": p.referencia_tipo,
                        "referencia_id": p.referencia_id,
                        "url": rota_da_referencia(p.referencia_tipo, p.referencia_id),
                    },
                }
            )
    return mensagens


def enviar(pendentes: list[PushPendente], cliente: httpx.Client | None = None) -> int:
    """Envia e desativa tokens que o Expo diz não existirem mais. Retorna quantas mensagens foram aceitas."""
    settings = get_settings()
    with SessionLocal() as db:
        mensagens = montar_mensagens(db, pendentes)
        if not mensagens:
            return 0
        cabecalhos = {"Accept": "application/json", "Content-Type": "application/json"}
        if settings.EXPO_ACCESS_TOKEN:
            cabecalhos["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

        aceitas, invalidos = 0, set()
        http = cliente or httpx.Client(timeout=10)
        try:
            for i in range(0, len(mensagens), _LOTE):
                lote = mensagens[i : i + _LOTE]
                resposta = http.post(settings.EXPO_PUSH_URL, json=lote, headers=cabecalhos)
                if resposta.status_code != 200:
                    logger.warning("Expo Push respondeu %s: %s", resposta.status_code, resposta.text[:300])
                    continue
                # Um "ticket" por mensagem, na mesma ordem.
                for msg, ticket in zip(lote, resposta.json().get("data", []), strict=False):
                    if ticket.get("status") == "ok":
                        aceitas += 1
                    elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                        invalidos.add(msg["to"])
                    else:
                        logger.warning("Push recusado para um token: %s", ticket.get("message"))
        finally:
            if cliente is None:
                http.close()

        if invalidos:
            db.execute(update(DeviceToken).where(DeviceToken.token.in_(invalidos)).values(ativo=False))
            db.commit()
            logger.info("%d token(s) de push desativado(s) (DeviceNotRegistered)", len(invalidos))
        logger.info("Push: %d de %d mensagem(ns) aceita(s) pelo Expo", aceitas, len(mensagens))
        return aceitas
