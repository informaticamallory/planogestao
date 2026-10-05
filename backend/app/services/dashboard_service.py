from calendar import monthrange
from collections import Counter
from datetime import date

from sqlalchemy.orm import Session

from app.core.tempo import como_utc, data_local
from app.models import Usuario
from app.models.enums import StatusPlano
from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard import (
    AtividadeRecente,
    CalendarioMes,
    DiaCalendario,
    EvolucaoPlanos,
    FatiaStatusAcoes,
    MinhaAcao,
    PeriodoAplicado,
    PlanoRecente,
    PontoEvolucao,
    PrazoDoGrupo,
    StatusDoGrupo,
    ReferenciaPlano,
    ReferenciaUsuario,
    ResumoDashboard,
    StatusAcoes,
)
from app.services.escopo import filtro_areas_autorizadas, filtro_planos_visiveis
from app.services.periodo import Periodo
from app.services.regras import (
    CategoriaAcao,
    SituacaoPrazo,
    TagPrazo,
    acao_concluida_no_prazo,
    acao_vencendo,
    categoria_acao,
    plano_atrasado,
    situacao_prazo,
    tag_prazo_acao,
    tag_prazo_plano,
)


def _periodo_aplicado(periodo: Periodo) -> PeriodoAplicado:
    return PeriodoAplicado(tipo=periodo.tipo, inicio=periodo.inicio, fim=periodo.fim)


class DashboardService:
    """Os filtros de período usam a data de criação do plano/ação (exceto onde indicado)."""

    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.usuario = usuario
        self.hoje = hoje
        self.repo = DashboardRepository(db, filtro_planos_visiveis(usuario))

    def _contar_acoes(self, periodo: Periodo) -> tuple[Counter[CategoriaAcao], Counter[TagPrazo], float | None]:
        """Status de execução (3 categorias) e situação do prazo contados à parte: uma ação
        em andamento e em atraso entra em "Em andamento" e também em "Em atraso"."""
        categorias: Counter[CategoriaAcao] = Counter()
        tags: Counter[TagPrazo] = Counter()
        base_cumprimento = no_prazo = 0
        for status, prazo, concluida_em in self.repo.acoes_criadas_entre(periodo.inicio_utc, periodo.fim_exclusivo_utc):
            categoria = categoria_acao(status, prazo, self.hoje)
            if categoria is None:
                continue
            categorias[categoria] += 1
            tag = tag_prazo_acao(status, prazo, self.hoje)
            if tag is not None:
                tags[tag] += 1
            if categoria == CategoriaAcao.CONCLUIDA or tag == TagPrazo.EM_ATRASO:
                base_cumprimento += 1
                no_prazo += acao_concluida_no_prazo(status, prazo, concluida_em)
        percentual = round(100 * no_prazo / base_cumprimento, 1) if base_cumprimento else None
        return categorias, tags, percentual

    def resumo(self, periodo: Periodo) -> ResumoDashboard:
        inicio, fim = periodo.inicio_utc, periodo.fim_exclusivo_utc
        planos = self.repo.planos_criados_entre(inicio, fim)
        status_planos = Counter(status for status, _ in planos)
        acoes, tags, percentual = self._contar_acoes(periodo)
        # Sub-itens: todos os níveis, cada um uma vez (pelo próprio registro, nunca somando filhos).
        subitens = self.repo.subitens_criados_entre(inicio, fim)
        status_sub = Counter(categoria_acao(s, p, self.hoje) for s, p in subitens)
        tags_sub = Counter(t for s, p in subitens if (t := tag_prazo_acao(s, p, self.hoje)) is not None)
        tags_planos = Counter(t for s, f in planos if (t := tag_prazo_plano(s, f, self.hoje)) is not None)
        progressos = self.repo.progresso_planos_criados_entre(inicio, fim)

        def prazo(grupo: str, c: Counter) -> PrazoDoGrupo:
            return PrazoDoGrupo(
                grupo=grupo, em_atraso=c[TagPrazo.EM_ATRASO], a_vencer=c[TagPrazo.A_VENCER], no_prazo=c[TagPrazo.NO_PRAZO]
            )

        return ResumoDashboard(
            periodo=_periodo_aplicado(periodo),
            total_planos=len(planos),
            planos_nao_iniciados=status_planos[StatusPlano.NAO_INICIADO],
            planos_ativos=status_planos[StatusPlano.EM_ANDAMENTO],
            planos_atrasados=sum(plano_atrasado(s, prazo, self.hoje) for s, prazo in planos),
            planos_concluidos=status_planos[StatusPlano.CONCLUIDO],
            acoes_pendentes=acoes[CategoriaAcao.PENDENTE],
            acoes_em_andamento=acoes[CategoriaAcao.EM_ANDAMENTO],
            acoes_concluidas=acoes[CategoriaAcao.CONCLUIDA],
            acoes_atrasadas=tags[TagPrazo.EM_ATRASO],
            percentual_cumprimento=percentual,
            total_acoes=sum(acoes.values()),
            total_subitens=len(subitens),
            subitens_nao_iniciados=status_sub[CategoriaAcao.PENDENTE],
            subitens_em_andamento=status_sub[CategoriaAcao.EM_ANDAMENTO],
            subitens_concluidos=status_sub[CategoriaAcao.CONCLUIDA],
            progresso_geral=round(sum(progressos) / len(progressos), 1) if progressos else None,
            status_execucao=[
                StatusDoGrupo(
                    grupo="planos",
                    nao_iniciado=status_planos[StatusPlano.NAO_INICIADO],
                    em_andamento=status_planos[StatusPlano.EM_ANDAMENTO],
                    concluido=status_planos[StatusPlano.CONCLUIDO],
                ),
                *(
                    StatusDoGrupo(
                        grupo=g, nao_iniciado=c[CategoriaAcao.PENDENTE], em_andamento=c[CategoriaAcao.EM_ANDAMENTO], concluido=c[CategoriaAcao.CONCLUIDA]
                    )
                    for g, c in (("acoes", acoes), ("subitens", status_sub))
                ),
            ],
            situacao_prazo=[prazo("planos", tags_planos), prazo("acoes", tags), prazo("subitens", tags_sub)],
        )

    def evolucao_planos(self, periodo: Periodo) -> EvolucaoPlanos:
        intervalos = periodo.intervalos()
        criados: Counter[int] = Counter()
        concluidos: Counter[int] = Counter()
        atrasados: Counter[int] = Counter()

        def indice(dia: date) -> int | None:
            if not periodo.contem(dia):
                return None
            return next(i for i, (ini, fim) in enumerate(intervalos) if ini <= dia <= fim)

        linhas = self.repo.planos_para_evolucao(
            periodo.inicio_utc, periodo.fim_exclusivo_utc, periodo.inicio, periodo.fim
        )
        for status, data_fim_estimado, criado_em, concluido_em in linhas:
            if (i := indice(data_local(criado_em))) is not None:
                criados[i] += 1
            dia_conclusao = data_local(concluido_em) if concluido_em else None
            if status == StatusPlano.CONCLUIDO and dia_conclusao and (i := indice(dia_conclusao)) is not None:
                concluidos[i] += 1
            # Estourou o prazo: prazo já passou e não foi concluído até ele.
            estourou = data_fim_estimado < self.hoje and (dia_conclusao is None or dia_conclusao > data_fim_estimado)
            if estourou and (i := indice(data_fim_estimado)) is not None:
                atrasados[i] += 1

        return EvolucaoPlanos(
            periodo=_periodo_aplicado(periodo),
            granularidade=periodo.granularidade,
            pontos=[
                PontoEvolucao(inicio=ini, fim=fim, criados=criados[i], concluidos=concluidos[i], atrasados=atrasados[i])
                for i, (ini, fim) in enumerate(intervalos)
            ],
        )

    def status_acoes(self, periodo: Periodo) -> StatusAcoes:
        categorias, _, _ = self._contar_acoes(periodo)
        fatias = [FatiaStatusAcoes(categoria=c, total=categorias[c]) for c in CategoriaAcao]
        return StatusAcoes(periodo=_periodo_aplicado(periodo), total=sum(categorias.values()), fatias=fatias)

    def planos_recentes(self, periodo: Periodo, limite: int) -> list[PlanoRecente]:
        return [
            PlanoRecente(
                id=r.id,
                codigo=r.codigo,
                nome=r.nome,
                status=r.status,
                prazo_tag=tag_prazo_plano(r.status, r.data_fim_estimado, self.hoje),
                data_fim_estimado=r.data_fim_estimado,
                responsavel=ReferenciaUsuario(id=r.responsavel_id, nome=r.responsavel_nome),
                total_acoes=int(r.total_acoes),
                acoes_concluidas=int(r.acoes_concluidas),
                progresso=round(float(r.progresso)),
                criado_em=como_utc(r.criado_em),
            )
            for r in self.repo.planos_recentes(periodo.inicio_utc, periodo.fim_exclusivo_utc, limite)
        ]

    def atividades_recentes(self, periodo: Periodo, limite: int) -> list[AtividadeRecente]:
        return [
            AtividadeRecente(
                id=r.id,
                evento=r.evento,
                campo_alterado=r.campo_alterado,
                valor_anterior=r.valor_anterior,
                valor_novo=r.valor_novo,
                detalhe=r.detalhe,
                criado_em=como_utc(r.criado_em),
                usuario=ReferenciaUsuario(id=r.usuario_id, nome=r.usuario_nome),
                acao_id=r.acao_id,
                acao_descricao=r.acao_descricao,
                plano=ReferenciaPlano(id=r.plano_id, codigo=r.plano_codigo, nome=r.plano_nome),
            )
            for r in self.repo.atividades_recentes(periodo.inicio_utc, periodo.fim_exclusivo_utc, limite)
        ]

    def minhas_acoes(self, limite: int) -> list[MinhaAcao]:
        """Ações abertas do próprio usuário, das mais urgentes para as menos (sem filtro de período)."""
        resultado = []
        for r in self.repo.acoes_abertas_do_usuario(self.usuario.id, limite, filtro_areas_autorizadas(self.usuario)):
            categoria = categoria_acao(r.status, r.prazo, self.hoje)
            assert categoria is not None  # só vêm ações abertas
            resultado.append(
                MinhaAcao(
                    id=r.id,
                    descricao=r.descricao,
                    status=r.status,
                    categoria=categoria,
                    prazo_tag=tag_prazo_acao(r.status, r.prazo, self.hoje),
                    vencendo=acao_vencendo(r.status, r.prazo, self.hoje),
                    prioridade=r.prioridade,
                    prazo=r.prazo,
                    progresso=r.progresso,
                    plano=ReferenciaPlano(id=r.plano_id, codigo=r.plano_codigo, nome=r.plano_nome),
                )
            )
        return resultado

    def calendario(self, ano: int, mes: int) -> CalendarioMes:
        """Ações visíveis por dia de prazo no mês (sem filtro de período)."""
        primeiro = date(ano, mes, 1)
        ultimo = date(ano, mes, monthrange(ano, mes)[1])
        dias: dict[date, Counter[str]] = {}
        # Mesma classificação de Minhas Ações (regras.situacao_prazo).
        chaves = {
            SituacaoPrazo.ATRASADA: "atrasadas",
            SituacaoPrazo.VENCENDO: "vencendo",
            SituacaoPrazo.EM_ANDAMENTO: "em_andamento",
            SituacaoPrazo.CONCLUIDA: "concluidas",
        }
        for status, prazo in self.repo.acoes_com_prazo_entre(primeiro, ultimo):
            if (situacao := situacao_prazo(status, prazo, self.hoje)) is not None:
                dias.setdefault(prazo, Counter())[chaves[situacao]] += 1

        return CalendarioMes(
            ano=ano,
            mes=mes,
            dias=[
                DiaCalendario(
                    data=dia,
                    atrasadas=c["atrasadas"],
                    vencendo=c["vencendo"],
                    em_andamento=c["em_andamento"],
                    concluidas=c["concluidas"],
                )
                for dia, c in sorted(dias.items())
            ],
        )
