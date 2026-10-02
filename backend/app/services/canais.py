"""Registro dos canais de notificação. Novos canais (e-mail, WhatsApp, n8n) entram aqui."""

from app.services.eventos import CanalLog, registrar_canal_externo, registrar_canal_interno
from app.services.notificacao_service import CanalNotificacaoApp

_configurado = False


def configurar_canais() -> None:
    global _configurado
    if _configurado:
        return
    registrar_canal_interno(CanalNotificacaoApp())
    # Exemplo de canal externo (só registra em log, após o commit). Substituir/adicionar ex.:
    # registrar_canal_externo(CanalWebhookN8n(url=...)) ou CanalEmail(smtp=...)
    registrar_canal_externo(CanalLog())
    _configurado = True
