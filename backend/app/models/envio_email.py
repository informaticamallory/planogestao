from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK

# Corpo do e-mail: TEXT (64 KB) basta para o modelo, mas MEDIUMTEXT evita corte em descrições longas.
TextoLongo = Text().with_variant(mysql.MEDIUMTEXT(), "mysql")


class SituacaoEnvio:
    PENDENTE = "pendente"  # na fila (inclui as que aguardam nova tentativa)
    ENVIANDO = "enviando"  # reservado por um processo
    ENVIADO = "enviado"
    FALHOU = "falhou"  # esgotou as tentativas
    SEM_ENDERECO = "sem_endereco"  # responsável sem e-mail válido: não enviado
    IGNORADO = "ignorado"  # ex.: usuário inativo
    MODELO_INATIVO = "modelo_inativo"  # envio daquele tipo desativado em Configurações de e-mail
    DESABILITADO = "desabilitado"  # envio de e-mail desligado (EMAIL_HABILITADO=false)


class EnvioEmail(Base):
    """Fila persistente e registro dos e-mails de notificação: um por evento e destinatário.

    Gravado na MESMA transação do registro que gerou o evento (some num rollback) e enviado
    depois do commit, em segundo plano, com novas tentativas. `chave` impede duplicidade.
    """

    __tablename__ = "envios_email"
    __table_args__ = (Index("ix_envios_email_situacao_proxima", "situacao", "proxima_tentativa_em"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    # "<evento>:<referencia_tipo>:<referencia_id>:<usuario_id>": o mesmo evento nunca vai duas vezes à mesma pessoa.
    chave: Mapped[str] = mapped_column(String(191), unique=True, nullable=False)
    evento: Mapped[str] = mapped_column(String(40), nullable=False)  # plano_criado | acao_criada | subitem_criado
    referencia_tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # plano | acao
    referencia_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # O registro sobrevive à exclusão do usuário (auditoria): fica sem o vínculo.
    usuario_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True)
    destinatario: Mapped[str | None] = mapped_column(String(255))  # endereço usado (null = sem endereço)
    # Cópia oculta (separada por vírgula): só no envelope SMTP, nunca no cabeçalho nem no corpo.
    cco: Mapped[str | None] = mapped_column(Text)
    assunto: Mapped[str] = mapped_column(String(255), nullable=False)
    corpo_html: Mapped[str] = mapped_column(TextoLongo, nullable=False)
    corpo_texto: Mapped[str] = mapped_column(TextoLongo, nullable=False)
    situacao: Mapped[str] = mapped_column(String(20), nullable=False)
    tentativas: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    proxima_tentativa_em: Mapped[datetime | None] = mapped_column(DateTime)
    processando_desde: Mapped[datetime | None] = mapped_column(DateTime)
    ultimo_erro: Mapped[str | None] = mapped_column(Text)
    enviado_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Avisos operacionais: o que conferir de novo antes do envio (plano/item, prazo e responsável vigentes;
    # no resumo semanal, os planos e o período). Nulo nos e-mails que não revalidam.
    contexto: Mapped[dict | None] = mapped_column(JSON)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ResultadoTentativa:
    ENVIADO = "enviado"
    FALHOU = "falhou"  # vai tentar de novo (ou esgotou: ver a situação do envio)
    CANCELADO = "cancelado"  # não enviado na revalidação (ex.: perdeu o acesso ao plano)


class EnvioEmailTentativa(Base):
    """Auditoria de cada tentativa de um e-mail da fila: o registro do envio guarda só a última situação."""

    __tablename__ = "envios_email_tentativas"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    envio_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("envios_email.id", ondelete="CASCADE"), nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    resultado: Mapped[str] = mapped_column(String(20), nullable=False)
    erro: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
