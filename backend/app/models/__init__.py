"""Importa todos os models para registrá-los no metadata (usado pelo Alembic)."""

from app.models.acao import Acao, AcaoHistorico, AcaoSolicitacaoAlteracao, acao_dependencia
from app.models.notificacao import Notificacao, ResumoSemanalPlano
from app.models.base import Base
from app.models.configuracao import Configuracao
from app.models.dispositivo import DeviceToken
from app.models.email_config import ConfigEmail, HistoricoConfigEmail, ModeloEmail
from app.models.envio_email import EnvioEmail, EnvioEmailTentativa, ResultadoTentativa, SituacaoEnvio
from app.models.equipe import Equipe, EquipeHistorico, EquipeMembro
from app.models.estrutura import Area, Setor
from app.models.gamificacao import (
    CategoriaPontuacao,
    GamificacaoAuditoria,
    GamificacaoFotografia,
    GamificacaoLancamento,
    GamificacaoPeriodo,
    GamificacaoPremio,
    GamificacaoRegra,
    GatilhoPontuacao,
)
from app.models.perfil import Perfil, Permissao, perfil_permissao
from app.models.plano import OrigemPlano, PlanoAnexo, PlanoDeAcao, PlanoHistorico, PlanoSequencia, TipoPlano, tipo_origem
from app.models.preferencia import PreferenciaLayout, PreferenciaNotificacao
from app.models.refresh_token import RefreshToken
from app.models.usuario import Usuario, usuario_area_autorizada
from app.models.convite import Convite, ConviteEvento, EventoConvite  # noqa: E402
from app.models import exclusao_logica  # noqa: F401,E402  (registra o filtro global de excluídos)

__all__ = [
    "Acao",
    "AcaoHistorico",
    "AcaoSolicitacaoAlteracao",
    "Notificacao",
    "Area",
    "Base",
    "Configuracao",
    "DeviceToken",
    "ConfigEmail",
    "Convite",
    "ConviteEvento",
    "EventoConvite",
    "EnvioEmail",
    "EnvioEmailTentativa",
    "ResultadoTentativa",
    "HistoricoConfigEmail",
    "ModeloEmail",
    "SituacaoEnvio",
    "Equipe",
    "EquipeHistorico",
    "EquipeMembro",
    "CategoriaPontuacao",
    "GamificacaoAuditoria",
    "GamificacaoFotografia",
    "GamificacaoLancamento",
    "GamificacaoPeriodo",
    "GamificacaoPremio",
    "GamificacaoRegra",
    "GatilhoPontuacao",
    "OrigemPlano",
    "Perfil",
    "Permissao",
    "PlanoAnexo",
    "PlanoDeAcao",
    "PlanoHistorico",
    "PlanoSequencia",
    "PreferenciaLayout",
    "PreferenciaNotificacao",
    "ResumoSemanalPlano",
    "RefreshToken",
    "Setor",
    "TipoPlano",
    "Usuario",
    "acao_dependencia",
    "perfil_permissao",
    "tipo_origem",
    "usuario_area_autorizada",
]
