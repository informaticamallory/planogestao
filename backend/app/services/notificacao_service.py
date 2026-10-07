"""Canal interno de notificações no app (tabela `notificacoes`) + push para o mobile."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notificacao
from app.services.eventos import Evento
from app.services.push import agendar_push


class CanalNotificacaoApp:
    def entregar(self, db: Session, evento: Evento) -> int:
        from app.services.preferencias_notificacao import recebem  # evita import circular

        criadas: list[Notificacao] = []
        destinatarios = evento.destinatarios_efetivos()
        # Preferência "Receber no sistema" (só nos tipos configuráveis; os demais vão sempre).
        querem = recebem(db, evento.tipo, destinatarios, "sistema")
        for usuario_id in (d for d in destinatarios if d in querem):
            chave = f"{evento.chave_deduplicacao}:{usuario_id}" if evento.chave_deduplicacao else None
            if chave and db.scalar(select(Notificacao.id).where(Notificacao.chave_deduplicacao == chave)):
                continue  # este alerta já foi dado para este usuário
            notificacao = Notificacao(
                usuario_id=usuario_id,
                tipo=evento.tipo,
                titulo=evento.titulo[:200],
                mensagem=evento.mensagem,
                referencia_tipo=evento.referencia_tipo,
                referencia_id=evento.referencia_id,
                chave_deduplicacao=chave,
            )
            db.add(notificacao)
            criadas.append(notificacao)
        if criadas:
            db.flush()
            # Push só de quem recebeu a notificação (respeita a deduplicação) e só após o commit.
            for notificacao in criadas:
                agendar_push(db, notificacao)
        return len(criadas)
