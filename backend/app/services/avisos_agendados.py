"""Avisos que dependem do calendário (job do agendador, a cada ALERTAS_INTERVALO_MIN): resumo semanal
(resumo_semanal.py) e plano sem atualização. Datas e horários no fuso America/Sao_Paulo.

Plano sem atualização:
- planos em execução (não concluídos), liberados, não arquivados nem excluídos;
- dias sem movimentação relevante (movimentacoes.py) a partir do intervalo de Configurações (padrão 7);
- repete a cada N dias (padrão 7; 0 = uma vez só) enquanto continuar parado — a chave leva a última
  movimentação e o ciclo, então uma movimentação nova reinicia a contagem e reexecutar não duplica;
- só para o responsável pelo plano (o gestor), nunca para toda a equipe nem para os administradores.
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tempo import data_local, hoje_local
from app.models import EnvioEmail, PlanoDeAcao
from app.models.enums import STATUS_PLANO_EM_EXECUCAO
from app.services import avisos, movimentacoes
from app.services.configuracoes import valor_inteiro
from app.services.email_notificacoes import registrar_validador
from app.services.resumo_semanal import ResultadoResumo, gerar_resumos_semanais  # noqa: F401  (registra o validador)


def verificar_planos_sem_atualizacao(db: Session, hoje: date | None = None) -> int:
    hoje = hoje or hoje_local()
    intervalo = valor_inteiro("dias_plano_sem_atualizacao")
    repeticao = valor_inteiro("dias_repeticao_aviso_inatividade")
    planos = list(db.scalars(
        select(PlanoDeAcao).where(
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO), PlanoDeAcao.arquivado_em.is_(None), PlanoDeAcao.rascunho.is_(False),
        )
    ))
    ultimas = movimentacoes.ultimas(db, [p.id for p in planos])
    criadas = 0
    for plano in planos:
        ultima = ultimas.get(plano.id, plano.criado_em)
        dias = (hoje - data_local(ultima)).days
        if dias < intervalo:
            continue
        ciclo = 0 if repeticao == 0 else (dias - intervalo) // repeticao
        _, descricao = movimentacoes.descrever_ultima(db, plano)
        criadas += avisos.plano_sem_atualizacao(db, plano, ultima, descricao, dias, ciclo)
    db.commit()
    return criadas


def _revalidar_inatividade(db: Session, envio: EnvioEmail) -> str | None:
    """Além da regra comum: se houve movimentação depois do aviso, o e-mail perdeu o sentido."""
    if motivo := avisos.revalidar(db, envio):
        return motivo
    ctx = envio.contexto or {}
    atual = movimentacoes.ultimas(db, [ctx.get("plano_id", 0)]).get(ctx.get("plano_id", 0))
    if atual is not None and ctx.get("ultima") and atual > datetime.fromisoformat(ctx["ultima"]):
        return "O plano teve movimentação depois do aviso."
    return None


registrar_validador("plano_sem_atualizacao", _revalidar_inatividade)
