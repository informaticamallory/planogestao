from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import ColumnElement, Row, Select, and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import (
    Acao,
    AcaoHistorico,
    Area,
    Equipe,
    OrigemPlano,
    PlanoAnexo,
    PlanoDeAcao,
    PlanoHistorico,
    Setor,
    TipoPlano,
    Usuario,
)
from app.models.enums import Prioridade, StatusPlano
from app.repositories.consultas_comuns import agregado_acoes_por_plano
from app.schemas.plano import FiltroArquivados, OrdenacaoPlano, StatusFiltroPlano
from app.services.periodo import Periodo
from app.services.regras import TagPrazo, tag_prazo_plano_sql


@dataclass
class FiltrosPlanos:
    busca: str | None = None
    status: list[StatusFiltroPlano] = field(default_factory=list)
    # Situação do prazo (fim estimado): independente do status.
    prazo: list[TagPrazo] = field(default_factory=list)
    # None = todos; True = só rascunhos; False = só liberados.
    rascunho: bool | None = None
    prioridade: list[Prioridade] = field(default_factory=list)
    responsavel_id: int | None = None
    area_id: int | None = None
    setor_id: int | None = None
    tipo_id: int | None = None
    origem_id: int | None = None
    # Plano vinculado à equipe.
    equipe_id: int | None = None
    periodo: Periodo | None = None
    meus: bool = False
    arquivados: FiltroArquivados = FiltroArquivados.EXCLUIR


@dataclass
class Ordenacao:
    campo: OrdenacaoPlano = OrdenacaoPlano.CRIADO_EM
    decrescente: bool = True


class PlanoRepository:
    def __init__(self, db: Session, filtro_visibilidade: ColumnElement[bool]):
        """`filtro_visibilidade` deve vir de escopo.filtro_planos_visiveis(..., incluir_arquivados=True);
        o tratamento de arquivados é feito aqui, conforme FiltrosPlanos.arquivados."""
        self.db = db
        self.visivel = filtro_visibilidade

    def _consulta_listagem(self) -> tuple[Select, dict]:
        agregado = agregado_acoes_por_plano()
        responsavel = aliased(Usuario)
        colunas = {
            "responsavel_nome": responsavel.nome,
            "area_nome": Area.nome,
            "progresso": func.coalesce(agregado.c.progresso, 0),
        }
        stmt = (
            select(
                PlanoDeAcao.id,
                PlanoDeAcao.codigo,
                PlanoDeAcao.nome,
                PlanoDeAcao.status,
                PlanoDeAcao.rascunho,
                PlanoDeAcao.prioridade,
                PlanoDeAcao.data_inicio_estimado,
                PlanoDeAcao.data_fim_estimado,
                PlanoDeAcao.criado_em,
                PlanoDeAcao.concluido_em,
                PlanoDeAcao.arquivado_em,
                PlanoDeAcao.criado_por_id,
                responsavel.id.label("responsavel_id"),
                colunas["responsavel_nome"].label("responsavel_nome"),
                Area.id.label("area_id"),
                colunas["area_nome"].label("area_nome"),
                Setor.id.label("setor_id"),
                Setor.nome.label("setor_nome"),
                TipoPlano.id.label("tipo_id"),
                TipoPlano.nome.label("tipo_nome"),
                OrigemPlano.id.label("origem_id"),
                OrigemPlano.nome.label("origem_nome"),
                colunas["progresso"].label("progresso"),
                func.coalesce(agregado.c.total_acoes, 0).label("total_acoes"),
                func.coalesce(agregado.c.acoes_concluidas, 0).label("acoes_concluidas"),
            )
            .join(responsavel, PlanoDeAcao.responsavel_id == responsavel.id)
            .join(Area, PlanoDeAcao.area_id == Area.id)
            .outerjoin(Setor, PlanoDeAcao.setor_id == Setor.id)
            .join(TipoPlano, PlanoDeAcao.tipo_id == TipoPlano.id)
            .join(OrigemPlano, PlanoDeAcao.origem_id == OrigemPlano.id)
            .outerjoin(agregado, agregado.c.plano_id == PlanoDeAcao.id)
            .where(self.visivel)
        )
        return stmt, colunas

    def _condicoes(self, f: FiltrosPlanos, usuario_id: int, hoje: date) -> list[ColumnElement[bool]]:
        condicoes: list[ColumnElement[bool]] = []

        if f.busca:
            termo = f.busca.strip()
            condicoes.append(
                or_(PlanoDeAcao.nome.contains(termo, autoescape=True), PlanoDeAcao.codigo.contains(termo, autoescape=True))
            )

        if f.status:
            # Valores do mesmo filtro são alternativas (OR); filtros diferentes se combinam em AND.
            condicoes.append(PlanoDeAcao.status.in_([StatusPlano(s.value) for s in f.status]))
        if f.prazo:
            tag = tag_prazo_plano_sql(PlanoDeAcao.status, PlanoDeAcao.data_fim_estimado, hoje)
            condicoes.append(tag.in_([t.value for t in f.prazo]))
        if f.rascunho is not None:
            condicoes.append(PlanoDeAcao.rascunho.is_(f.rascunho))

        if f.prioridade:
            condicoes.append(PlanoDeAcao.prioridade.in_(f.prioridade))

        for coluna, valor in (
            (PlanoDeAcao.responsavel_id, f.responsavel_id),
            (PlanoDeAcao.area_id, f.area_id),
            (PlanoDeAcao.setor_id, f.setor_id),
            (PlanoDeAcao.tipo_id, f.tipo_id),
            (PlanoDeAcao.origem_id, f.origem_id),
        ):
            if valor is not None:
                condicoes.append(coluna == valor)

        if f.equipe_id is not None:
            # O plano ao qual a equipe está vinculada (não os planos de cada participante).
            condicoes.append(PlanoDeAcao.id.in_(select(Equipe.plano_id).where(Equipe.id == f.equipe_id)))

        if f.meus:
            condicoes.append(PlanoDeAcao.responsavel_id == usuario_id)

        if f.periodo:
            condicoes.append(PlanoDeAcao.criado_em >= f.periodo.inicio_utc)
            condicoes.append(PlanoDeAcao.criado_em < f.periodo.fim_exclusivo_utc)

        if f.arquivados == FiltroArquivados.EXCLUIR:
            condicoes.append(PlanoDeAcao.arquivado_em.is_(None))
        elif f.arquivados == FiltroArquivados.SOMENTE:
            condicoes.append(PlanoDeAcao.arquivado_em.is_not(None))

        return condicoes

    def listar(
        self,
        filtros: FiltrosPlanos,
        ordenacao: Ordenacao,
        usuario_id: int,
        hoje: date,
        *,
        offset: int | None = None,
        limite: int | None = None,
    ) -> tuple[list[Row], int]:
        stmt, colunas = self._consulta_listagem()
        stmt = stmt.where(*self._condicoes(filtros, usuario_id, hoje))

        total = self.db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0

        coluna_ordem = {
            OrdenacaoPlano.CODIGO: PlanoDeAcao.codigo,
            OrdenacaoPlano.NOME: PlanoDeAcao.nome,
            OrdenacaoPlano.RESPONSAVEL: colunas["responsavel_nome"],
            OrdenacaoPlano.AREA: colunas["area_nome"],
            # ENUM do MySQL ordena pela ordem de declaração: baixa < media < alta < critica.
            OrdenacaoPlano.PRIORIDADE: PlanoDeAcao.prioridade,
            OrdenacaoPlano.INICIO: PlanoDeAcao.data_inicio_estimado,
            OrdenacaoPlano.PRAZO: PlanoDeAcao.data_fim_estimado,
            OrdenacaoPlano.PROGRESSO: colunas["progresso"],
            OrdenacaoPlano.STATUS: PlanoDeAcao.status,
            OrdenacaoPlano.CRIADO_EM: PlanoDeAcao.criado_em,
        }[ordenacao.campo]
        direcao = coluna_ordem.desc() if ordenacao.decrescente else coluna_ordem.asc()
        # Desempate estável pelo id, para a paginação não repetir/pular linhas.
        desempate = PlanoDeAcao.id.desc() if ordenacao.decrescente else PlanoDeAcao.id.asc()
        stmt = stmt.order_by(direcao, desempate)

        if offset is not None:
            stmt = stmt.offset(offset)
        if limite is not None:
            stmt = stmt.limit(limite)
        return list(self.db.execute(stmt)), total

    def obter_visivel(self, plano_id: int) -> PlanoDeAcao | None:
        return self.db.scalar(select(PlanoDeAcao).where(PlanoDeAcao.id == plano_id, self.visivel))

    def dados_indicadores(self, plano_id: int) -> list[Row]:
        """(status, prazo, progresso, concluida_em) das ações principais; o cálculo filtra as descartadas.
        Subações não entram nos indicadores (a principal só conclui depois delas)."""
        return list(
            self.db.execute(
                select(Acao.status, Acao.prazo, Acao.progresso, Acao.concluida_em).where(
                    # Arquivadas ficam fora do cálculo operacional (status e progresso do plano).
                    Acao.plano_id == plano_id, Acao.acao_pai_id.is_(None), Acao.arquivado_em.is_(None)
                )
            )
        )

    def acoes_detalhadas(self, plano_id: int) -> list[Row]:
        """Ações e subações (todos os níveis) do plano, na ordem da árvore: 1, 1.1, 1.1.1, 1.2, 2…"""
        linhas = list(
            self.db.execute(
                select(Acao, Usuario.nome.label("responsavel_nome"))
                .join(Usuario, Acao.responsavel_id == Usuario.id)
                .where(Acao.plano_id == plano_id)
            )
        )
        return sorted(linhas, key=lambda r: [a.numero for a in (*r[0].caminho, r[0])])

    def historico_plano(self, plano_id: int) -> list[Row]:
        return list(
            self.db.execute(
                select(PlanoHistorico, Usuario.nome.label("usuario_nome"))
                # outer: entradas do sistema (transição automática de status) não têm usuário
                .outerjoin(Usuario, PlanoHistorico.usuario_id == Usuario.id)
                .where(PlanoHistorico.plano_id == plano_id)
            )
        )

    def historico_acoes(self, plano_id: int) -> list[Row]:
        return list(
            self.db.execute(
                select(AcaoHistorico, Usuario.nome.label("usuario_nome"), Acao.descricao.label("acao_descricao"))
                .join(Acao, AcaoHistorico.acao_id == Acao.id)
                .join(Usuario, AcaoHistorico.usuario_id == Usuario.id)
                .where(Acao.plano_id == plano_id)
            )
        )

    def anexos_com_autor(self, plano_id: int) -> list[Row]:
        return list(
            self.db.execute(
                select(PlanoAnexo, Usuario.nome.label("usuario_nome"))
                .join(Usuario, PlanoAnexo.enviado_por_id == Usuario.id)
                .where(PlanoAnexo.plano_id == plano_id)
            )
        )
