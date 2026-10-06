"""Relatório de ações: a MESMA consulta alimenta a pré-visualização (paginada) e a exportação."""

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.tempo import como_utc, data_local
from app.models import Acao, PlanoDeAcao, Usuario
from app.models.enums import StatusAcao
from app.services import exportacao
from app.services.escopo import filtro_planos_visiveis
from app.services.exportacao import ArquivoGerado, Coluna
from app.services.periodo import Periodo
from app.services.plano_service import LIMITE_EXPORTACAO, ROTULO_PRIORIDADE, ExportacaoGrandeDemais
from app.services.regras import SituacaoPrazo, acao_concluida_no_prazo, situacao_prazo, situacao_prazo_sql

ROTULO_STATUS_ACAO = {
    "aguardando_aceite": "Aguardando aceite", "aceita": "Aceita", "em_andamento": "Em andamento",
    "bloqueada": "Bloqueada", "concluida": "Concluída", "recusada": "Recusada", "cancelada": "Cancelada",
}
# Situação do prazo (tag), separada do status: abertas = Em atraso / A vencer / No prazo.
ROTULO_SITUACAO = {"atrasada": "Em atraso", "vencendo": "A vencer", "em_andamento": "No prazo", "concluida": "Concluída"}


@dataclass
class FiltrosRelatorioAcoes:
    responsavel_id: int | None = None
    plano_id: int | None = None
    status: list[StatusAcao] = field(default_factory=list)
    situacao: list[SituacaoPrazo] = field(default_factory=list)
    prazo_de: date | None = None
    prazo_ate: date | None = None
    periodo: Periodo | None = None  # data de criação da ação


@dataclass
class LinhaAcao:
    id: int
    plano_id: int
    plano_codigo: str
    plano_nome: str
    numero: str
    acao_origem: str | None  # subação: "2 — descrição" da ação principal
    depende_de: str | None  # números dos pré-requisitos ("1, 3")
    descricao: str
    responsavel: str
    area: str
    setor: str | None
    prazo_inicio: date | None
    iniciada_em: object | None
    prazo: date
    prioridade: str
    status: str
    situacao: str | None
    progresso: int
    no_prazo: bool | None  # só para concluídas
    criado_em: object
    concluida_em: object | None


class RelatorioAcoesService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje

    def _consulta(self, f: FiltrosRelatorioAcoes) -> Select:
        stmt = (
            select(Acao, PlanoDeAcao.codigo, PlanoDeAcao.nome, Usuario.nome)
            .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
            .join(Usuario, Acao.responsavel_id == Usuario.id)
            .where(filtro_planos_visiveis(self.usuario), Acao.arquivado_em.is_(None))
        )
        if f.responsavel_id is not None:
            stmt = stmt.where(Acao.responsavel_id == f.responsavel_id)
        if f.plano_id is not None:
            stmt = stmt.where(Acao.plano_id == f.plano_id)
        if f.status:
            stmt = stmt.where(Acao.status.in_(f.status))
        if f.situacao:
            stmt = stmt.where(situacao_prazo_sql(Acao.status, Acao.prazo, self.hoje).in_([s.value for s in f.situacao]))
        if f.prazo_de is not None:
            stmt = stmt.where(Acao.prazo >= f.prazo_de)
        if f.prazo_ate is not None:
            stmt = stmt.where(Acao.prazo <= f.prazo_ate)
        if f.periodo is not None:
            stmt = stmt.where(Acao.criado_em >= f.periodo.inicio_utc, Acao.criado_em < f.periodo.fim_exclusivo_utc)
        return stmt

    def _executar(self, f: FiltrosRelatorioAcoes, offset: int | None, limite: int | None) -> tuple[list[LinhaAcao], int]:
        stmt = self._consulta(f)
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        stmt = stmt.order_by(Acao.prazo.asc(), PlanoDeAcao.codigo.asc(), Acao.id.asc())
        if offset:
            stmt = stmt.offset(offset)
        if limite:
            stmt = stmt.limit(limite)
        linhas = []
        for a, codigo, nome, responsavel in self.db.execute(stmt):
            sit = situacao_prazo(a.status, a.prazo, self.hoje)
            linhas.append(
                LinhaAcao(
                    id=a.id, plano_id=a.plano_id, plano_codigo=codigo, plano_nome=nome,
                    numero=a.numero_exibicao,
                    acao_origem=f"{a.acao_pai.numero_exibicao} — {a.acao_pai.descricao}" if a.acao_pai else None,
                    depende_de=", ".join(p.numero_exibicao for p in a.depende_de) or None,
                    descricao=a.descricao, responsavel=responsavel,
                    area=a.area.nome, setor=a.setor.nome if a.setor else None,
                    prazo_inicio=a.prazo_inicio, iniciada_em=como_utc(a.iniciada_em) if a.iniciada_em else None,
                    prazo=a.prazo, prioridade=a.prioridade.value, status=a.status.value,
                    situacao=sit.value if sit else None, progresso=a.progresso,
                    no_prazo=acao_concluida_no_prazo(a.status, a.prazo, a.concluida_em) if a.status == StatusAcao.CONCLUIDA else None,
                    criado_em=como_utc(a.criado_em), concluida_em=como_utc(a.concluida_em) if a.concluida_em else None,
                )
            )
        return linhas, total

    def listar(self, f: FiltrosRelatorioAcoes, page: int, page_size: int) -> tuple[list[LinhaAcao], int]:
        return self._executar(f, (page - 1) * page_size, page_size)

    def descrever_filtros(self, f: FiltrosRelatorioAcoes) -> list[str]:
        partes: list[str] = []
        if f.responsavel_id is not None:
            u = self.db.get(Usuario, f.responsavel_id)
            partes.append(f"responsável {u.nome if u else f.responsavel_id}")
        if f.plano_id is not None:
            p = self.db.get(PlanoDeAcao, f.plano_id)
            partes.append(f"plano {p.codigo if p else f.plano_id}")
        if f.status:
            partes.append("status " + " ou ".join(ROTULO_STATUS_ACAO[s.value] for s in f.status))
        if f.situacao:
            partes.append("situação " + " ou ".join(ROTULO_SITUACAO[s.value] for s in f.situacao))
        if f.prazo_de or f.prazo_ate:
            de = f.prazo_de.strftime("%d/%m/%Y") if f.prazo_de else "…"
            ate = f.prazo_ate.strftime("%d/%m/%Y") if f.prazo_ate else "…"
            partes.append(f"prazo de {de} a {ate}")
        if f.periodo:
            partes.append(f"criadas de {f.periodo.inicio:%d/%m/%Y} a {f.periodo.fim:%d/%m/%Y}")
        return partes

    def exportar(self, f: FiltrosRelatorioAcoes, formato: str) -> ArquivoGerado:
        linhas, total = self._executar(f, None, LIMITE_EXPORTACAO)
        if total > LIMITE_EXPORTACAO:
            raise ExportacaoGrandeDemais(total)
        colunas = [
            Coluna("Plano", lambda a: a.plano_codigo, 13),
            Coluna("Nome do plano", lambda a: a.plano_nome, 28),
            Coluna("Nº", lambda a: a.numero, 6),
            Coluna("Ação", lambda a: a.descricao, 36),
            Coluna("Ação de origem", lambda a: a.acao_origem, 28),
            Coluna("Depende de", lambda a: a.depende_de, 12),
            Coluna("Responsável", lambda a: a.responsavel, 18),
            Coluna("Área", lambda a: a.area, 16),
            Coluna("Setor", lambda a: a.setor, 16),
            Coluna("Início estimado", lambda a: a.prazo_inicio, 11, "data"),
            Coluna("Prazo de conclusão", lambda a: a.prazo, 11, "data"),
            Coluna("Início real", lambda a: a.iniciada_em, 16, "data_hora"),
            Coluna("Prioridade", lambda a: ROTULO_PRIORIDADE[a.prioridade], 10),
            Coluna("Status", lambda a: ROTULO_STATUS_ACAO[a.status], 15),
            Coluna("Prazo (situação)", lambda a: ROTULO_SITUACAO.get(a.situacao or "", "—"), 12),
            Coluna("Progresso", lambda a: a.progresso, 10, "percentual"),
            Coluna("Concluída no prazo", lambda a: None if a.no_prazo is None else ("Sim" if a.no_prazo else "Não"), 10),
            Coluna("Criada em", lambda a: a.criado_em, 16, "data_hora"),
            Coluna("Concluída em", lambda a: a.concluida_em, 16, "data_hora"),
        ]
        cabecalho = [
            f"Gerado em {data_local(utcnow()).strftime('%d/%m/%Y')} por {self.usuario.nome} - {total} ação(ões)",
            "Filtros: " + (", ".join(self.descrever_filtros(f)) or "nenhum"),
        ]
        return exportacao.gerar_arquivo(formato, "Relatório de Ações", "acoes", cabecalho, colunas, linhas)
