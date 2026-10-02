"""Itens (ações principais e sub-itens de TODOS os níveis) para a listagem /itens.

Regras de contagem:
- item = qualquer ação; subação = item com pai (qualquer profundidade); ação principal = sem pai;
- cada item é contado uma única vez, pelo id (nunca somando totais de descendentes dos pais);
- recusados/cancelados ficam de fora (não são trabalho a fazer) — mesma regra dos demais indicadores;
- status agrupado: Não iniciado (aguardando aceite/aceita), Em andamento (em andamento/bloqueada), Concluído;
- situação do prazo = a tag de prazo já existente (concluído não tem tag de atraso);
- PAs arquivados ficam de fora por padrão (`arquivados`).
Os cards do Dashboard abrem esta listagem; as contagens agregadas ficam em DashboardService/IndicadoresService.
"""

import enum
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import Select, and_, select
from sqlalchemy.orm import Session

from app.models import Acao, PlanoDeAcao, Usuario
from app.models.enums import STATUS_ACAO_DESCARTADOS, StatusAcao
from app.schemas.plano import FiltroArquivados
from app.services.escopo import filtro_planos_visiveis
from app.services.periodo import Periodo
from app.services.regras import TagPrazo, tag_prazo_acao


class GrupoStatus(str, enum.Enum):
    NAO_INICIADO = "nao_iniciado"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"


STATUS_DO_GRUPO: dict[GrupoStatus, tuple[StatusAcao, ...]] = {
    GrupoStatus.NAO_INICIADO: (StatusAcao.AGUARDANDO_ACEITE, StatusAcao.ACEITA),
    GrupoStatus.EM_ANDAMENTO: (StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA),
    GrupoStatus.CONCLUIDO: (StatusAcao.CONCLUIDA,),
}


def grupo_status(status: StatusAcao) -> GrupoStatus | None:
    return next((g for g, lista in STATUS_DO_GRUPO.items() if status in lista), None)


class CampoData(str, enum.Enum):
    CRIACAO = "criacao"  # data de criação do item
    PRAZO = "prazo"  # prazo de conclusão do item


class Nivel(str, enum.Enum):
    PRINCIPAL = "principal"
    SUBACAO = "subacao"


@dataclass
class FiltrosItens:
    plano_id: int | None = None
    responsavel_id: int | None = None
    area_id: int | None = None  # área do item (não do plano)
    setor_id: int | None = None
    status: list[GrupoStatus] = field(default_factory=list)
    prazo: list[TagPrazo] = field(default_factory=list)
    nivel: Nivel | None = None
    periodo: Periodo | None = None
    campo_data: CampoData = CampoData.CRIACAO
    arquivados: FiltroArquivados = FiltroArquivados.EXCLUIR


class PainelItensService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje

    # ---- consulta única ------------------------------------------------------------------------

    def _consulta(self, f: FiltrosItens) -> Select:
        stmt = (
            select(Acao, PlanoDeAcao.codigo, PlanoDeAcao.nome, Usuario.nome)
            .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
            .join(Usuario, Acao.responsavel_id == Usuario.id)
            .where(filtro_planos_visiveis(self.usuario, incluir_arquivados=True), Acao.status.not_in(STATUS_ACAO_DESCARTADOS))
        )
        if f.arquivados == FiltroArquivados.EXCLUIR:
            stmt = stmt.where(PlanoDeAcao.arquivado_em.is_(None))
        elif f.arquivados == FiltroArquivados.SOMENTE:
            stmt = stmt.where(PlanoDeAcao.arquivado_em.is_not(None))
        for coluna, valor in (
            (Acao.plano_id, f.plano_id),
            (Acao.responsavel_id, f.responsavel_id),
            (Acao.area_id, f.area_id),
            (Acao.setor_id, f.setor_id),
        ):
            if valor is not None:
                stmt = stmt.where(coluna == valor)
        if f.status:
            stmt = stmt.where(Acao.status.in_([s for g in f.status for s in STATUS_DO_GRUPO[g]]))
        if f.nivel == Nivel.PRINCIPAL:
            stmt = stmt.where(Acao.acao_pai_id.is_(None))
        elif f.nivel == Nivel.SUBACAO:
            stmt = stmt.where(Acao.acao_pai_id.is_not(None))
        if f.periodo is not None:
            if f.campo_data == CampoData.PRAZO:
                stmt = stmt.where(Acao.prazo.between(f.periodo.inicio, f.periodo.fim))
            else:
                stmt = stmt.where(and_(Acao.criado_em >= f.periodo.inicio_utc, Acao.criado_em < f.periodo.fim_exclusivo_utc))
        return stmt

    def _linhas(self, f: FiltrosItens) -> list[tuple[Acao, str, str, str]]:
        linhas = [tuple(r) for r in self.db.execute(self._consulta(f))]
        # A tag de prazo depende da data de hoje: filtrada aqui, com a mesma função das telas.
        if f.prazo:
            linhas = [r for r in linhas if tag_prazo_acao(r[0].status, r[0].prazo, self.hoje) in f.prazo]
        return linhas  # type: ignore[return-value]

    # ---- listagem (destino dos cards) ------------------------------------------------------------

    def listar(self, f: FiltrosItens, page: int, page_size: int) -> tuple[list[dict], int]:
        linhas = self._linhas(f)
        # Ordem: plano e, dentro dele, a árvore (1, 1.1, 1.1.1, 1.2, 2…).
        linhas.sort(key=lambda r: (r[1], [x.numero for x in (*r[0].caminho, r[0])]))
        total = len(linhas)
        pagina = linhas[(page - 1) * page_size : page * page_size]
        return [self._item(a, codigo, nome_plano, resp) for a, codigo, nome_plano, resp in pagina], total

    def _item(self, a: Acao, codigo: str, nome_plano: str, responsavel: str) -> dict:
        rotulo = lambda x: f"{'Sub-item' if x.eh_subacao else 'Ação'} {x.numero_exibicao}"  # noqa: E731
        return {
            "id": a.id,
            "numero": a.numero_exibicao,
            "nivel": a.nivel,
            "eh_subacao": a.eh_subacao,
            "descricao": a.descricao,
            "caminho": " → ".join([codigo, *(rotulo(x) for x in a.caminho)]),
            "plano": {"id": a.plano_id, "codigo": codigo, "nome": nome_plano},
            "responsavel": {"id": a.responsavel_id, "nome": responsavel},
            "area": {"id": a.area.id, "nome": a.area.nome},
            "setor": {"id": a.setor.id, "nome": a.setor.nome} if a.setor else None,
            "prazo_inicio": a.prazo_inicio,
            "prazo": a.prazo,
            "status": a.status,
            "grupo_status": grupo_status(a.status),
            "prazo_tag": tag_prazo_acao(a.status, a.prazo, self.hoje),
            "progresso": a.progresso,
        }
