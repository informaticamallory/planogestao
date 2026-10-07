"""Jobs em segundo plano (APScheduler), iniciados junto com a API.

Com vários processos da API, os jobs rodam em cada um; a deduplicação das notificações
(chave única) impede alertas repetidos, e cada e-mail é reservado antes do envio.
"""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.tempo import fuso_local, hoje_local
from app.services.alertas_prazo import verificar_prazos
from app.services.avisos_agendados import gerar_resumos_semanais, verificar_planos_sem_atualizacao
from app.services.email_notificacoes import processar_pendentes

logger = logging.getLogger("planogestao.agendador")


def job_avisos_agendados() -> None:
    """Resumo semanal (no dia/horário de Configurações) e plano sem atualização. Cada parte isolada."""
    try:
        with SessionLocal() as db:
            r = gerar_resumos_semanais(db, datetime.now(fuso_local()))
        if r.usuarios:
            logger.info("Resumo semanal %s a %s: %s pessoa(s), %s plano(s).", *r.periodo, r.usuarios, r.planos)
    except Exception:
        logger.exception("Falha no job do resumo semanal")
    try:
        with SessionLocal() as db:
            n = verificar_planos_sem_atualizacao(db, hoje_local())
        if n:
            logger.info("Plano sem atualização: %s notificação(ões) nova(s).", n)
    except Exception:
        logger.exception("Falha no job de planos sem atualização")


def job_alertas_de_prazo() -> None:
    try:
        with SessionLocal() as db:
            r = verificar_prazos(db, hoje_local())
        logger.info(
            "Alertas de prazo: %s ações e %s planos verificados, %s notificação(ões) nova(s).",
            r.acoes_verificadas, r.planos_verificados, r.notificacoes_criadas,
        )
    except Exception:
        logger.exception("Falha no job de alertas de prazo")


def job_envios_email() -> None:
    """Fila de e-mails: pendentes que não saíram logo após o commit e novas tentativas das falhas."""
    try:
        with SessionLocal() as db:
            r = processar_pendentes(db)
        if r.enviados or r.falhas or r.esgotados:
            logger.info("E-mails: %s enviado(s), %s falha(s) para nova tentativa, %s esgotado(s).", r.enviados, r.falhas, r.esgotados)
    except Exception:
        logger.exception("Falha no job de e-mails")


def iniciar_agendador() -> BackgroundScheduler | None:
    s = get_settings()
    jobs = []
    if s.ALERTAS_INTERVALO_MIN > 0:
        jobs.append((job_alertas_de_prazo, s.ALERTAS_INTERVALO_MIN, "alertas_prazo"))
        jobs.append((job_avisos_agendados, s.ALERTAS_INTERVALO_MIN, "avisos_agendados"))
    if s.EMAIL_HABILITADO and s.EMAIL_INTERVALO_MIN > 0:
        jobs.append((job_envios_email, s.EMAIL_INTERVALO_MIN, "envios_email"))
    if not jobs:
        return None
    agendador = BackgroundScheduler(timezone=fuso_local())
    # Rodam ao subir a API e depois a cada N minutos; nunca duas execuções do mesmo job ao mesmo tempo.
    for funcao, minutos, id_ in jobs:
        agendador.add_job(
            funcao,
            "interval",
            minutes=minutos,
            id=id_,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(fuso_local()),
        )
    agendador.start()
    return agendador
