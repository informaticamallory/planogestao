from datetime import date

from sqlalchemy import Row, select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.tempo import como_utc, data_local
from app.models import Area, Equipe, OrigemPlano, PlanoDeAcao, Setor, TipoPlano, Usuario
from app.repositories.plano_repository import FiltrosPlanos, Ordenacao, PlanoRepository
from app.schemas.comum import Opcao, Pagina
from app.schemas.plano import (
    AcaoDoPlano,
    ContagemAcoes,
    EventoTimeline,
    FiltroArquivados,
    FormatoExportacao,
    IndicadoresPlano,
    OpcoesPlanos,
    OperacoesAcao,
    PermissoesPlano,
    PlanoDetalhe,
    PlanoListaItem,
    PlanoResumo,
    SetorOpcao,
)
from app.services import dependencias, exportacao
from app.services.escopo import filtro_planos_visiveis
from app.services.exportacao import ArquivoGerado, Coluna
from app.services.indicadores import IndicadoresAcoes, calcular_indicadores
from app.services.ciclo_plano import apto_a_conclusao
from app.services.permissoes_plano import pode_arquivar, pode_concluir, pode_editar, pode_excluir
from app.services.regras import (
    CategoriaAcao,
    acao_vencendo,
    categoria_acao,
    plano_atrasado_para_iniciar,
    tag_prazo_acao,
    tag_prazo_plano,
)

LIMITE_EXPORTACAO = 10_000

ROTULO_STATUS = {"nao_iniciado": "Não iniciado", "em_andamento": "Em andamento", "concluido": "Concluído"}
ROTULO_PRAZO = {"em_atraso": "Em atraso", "a_vencer": "A vencer", "no_prazo": "No prazo", "sem_prazo": "Sem prazo definido"}
ROTULO_PRIORIDADE = {"baixa": "Baixa", "media": "Média", "alta": "Alta", "critica": "Crítica"}
ROTULO_FILTRO_STATUS = ROTULO_STATUS


class PlanoNaoEncontrado(Exception):
    pass


class ExportacaoGrandeDemais(Exception):
    def __init__(self, total: int):
        super().__init__(
            f"A exportação teria {total} planos; o limite é {LIMITE_EXPORTACAO}. Refine os filtros."
        )



def _opcao(id_: int | None, nome: str | None) -> Opcao | None:
    return Opcao(id=id_, nome=nome) if id_ is not None and nome is not None else None


class PlanoService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje
        self.repo = PlanoRepository(db, filtro_planos_visiveis(usuario, incluir_arquivados=True))

    # ---- listagem ----------------------------------------------------------------

    def _item(self, r: Row) -> PlanoListaItem:
        return PlanoListaItem(
            id=r.id,
            codigo=r.codigo,
            nome=r.nome,
            status=r.status,
            # Arquivado: a listagem mostra "Arquivado", não a situação do prazo.
            prazo_tag=None if r.arquivado_em else tag_prazo_plano(r.status, r.data_fim_estimado, self.hoje),
            atrasado_para_iniciar=r.arquivado_em is None and plano_atrasado_para_iniciar(r.status, r.data_inicio_estimado, self.hoje),
            rascunho=r.rascunho,
            prioridade=r.prioridade,
            data_inicio_estimado=r.data_inicio_estimado,
            data_fim_estimado=r.data_fim_estimado,
            responsavel=Opcao(id=r.responsavel_id, nome=r.responsavel_nome),
            area=Opcao(id=r.area_id, nome=r.area_nome),
            setor=_opcao(r.setor_id, r.setor_nome),
            tipo=Opcao(id=r.tipo_id, nome=r.tipo_nome),
            origem=Opcao(id=r.origem_id, nome=r.origem_nome),
            progresso=round(float(r.progresso)),
            total_acoes=int(r.total_acoes),
            acoes_concluidas=int(r.acoes_concluidas),
            criado_em=como_utc(r.criado_em),
            concluido_em=como_utc(r.concluido_em) if r.concluido_em else None,
            arquivado=r.arquivado_em is not None,
        )

    def listar(self, filtros: FiltrosPlanos, ordenacao: Ordenacao, page: int, page_size: int) -> Pagina[PlanoListaItem]:
        linhas, total = self.repo.listar(
            filtros, ordenacao, self.usuario.id, self.hoje, offset=(page - 1) * page_size, limite=page_size
        )
        return Pagina[PlanoListaItem](
            items=[self._item(r) for r in linhas], total=total, page=page, page_size=page_size
        )

    # ---- exportação --------------------------------------------------------------

    def exportar(self, filtros: FiltrosPlanos, ordenacao: Ordenacao, formato: FormatoExportacao) -> ArquivoGerado:
        """Mesmos filtros e ordenação da listagem, sem paginação."""
        linhas, total = self.repo.listar(filtros, ordenacao, self.usuario.id, self.hoje, limite=LIMITE_EXPORTACAO)
        if total > LIMITE_EXPORTACAO:
            raise ExportacaoGrandeDemais(total)
        itens = [self._item(r) for r in linhas]

        colunas = [
            Coluna("Código", lambda p: p.codigo, 14),
            Coluna("Nome", lambda p: p.nome, 40),
            Coluna("Status", lambda p: ROTULO_STATUS[p.status.value], 14),
            Coluna("Prazo", lambda p: ROTULO_PRAZO[p.prazo_tag.value] if p.prazo_tag else None, 12),
            Coluna("Rascunho", lambda p: "Sim" if p.rascunho else "Não", 9),
            Coluna("Arquivado", lambda p: "Sim" if p.arquivado else "Não", 9),
            Coluna("Prioridade", lambda p: ROTULO_PRIORIDADE[p.prioridade.value], 10),
            Coluna("Área", lambda p: p.area.nome, 14),
            Coluna("Função/Cargo", lambda p: p.setor.nome if p.setor else None, 16),
            Coluna("Tipo", lambda p: p.tipo.nome, 12),
            Coluna("Origem", lambda p: p.origem.nome, 18),
            Coluna("Responsável", lambda p: p.responsavel.nome, 18),
            Coluna("Início estimado", lambda p: p.data_inicio_estimado, 11, "data"),
            Coluna("Fim estimado", lambda p: p.data_fim_estimado, 11, "data"),
            Coluna("Progresso", lambda p: p.progresso, 10, "percentual"),
            Coluna("Ações concluídas", lambda p: f"{p.acoes_concluidas}/{p.total_acoes}", 10),
            Coluna("Criado em", lambda p: p.criado_em, 16, "data_hora"),
            Coluna("Concluído em", lambda p: p.concluido_em, 16, "data_hora"),
        ]

        cabecalho = [
            f"Gerado em {data_local(utcnow()).strftime('%d/%m/%Y')} por {self.usuario.nome} - {total} plano(s)",
            "Filtros: " + (", ".join(self.descrever_filtros(filtros)) or "nenhum"),
        ]
        return exportacao.gerar_arquivo(formato.value, "Planos de Ação", "planos", cabecalho, colunas, itens)

    def descrever_filtros(self, f: FiltrosPlanos) -> list[str]:
        partes: list[str] = []
        if f.busca:
            partes.append(f'busca "{f.busca}"')
        if f.status:
            partes.append("status " + " ou ".join(ROTULO_FILTRO_STATUS[s.value] for s in f.status))
        if f.prazo:
            partes.append("prazo " + " ou ".join(ROTULO_PRAZO[t.value] for t in f.prazo))
        if f.rascunho is not None:
            partes.append("só rascunhos" if f.rascunho else "sem rascunhos")
        if f.prioridade:
            partes.append("prioridade " + " ou ".join(ROTULO_PRIORIDADE[p.value] for p in f.prioridade))
        for rotulo, model, valor in (
            ("responsável", Usuario, f.responsavel_id),
            ("área", Area, f.area_id),
            ("função/cargo", Setor, f.setor_id),
            ("tipo", TipoPlano, f.tipo_id),
            ("origem", OrigemPlano, f.origem_id),
            ("equipe", Equipe, f.equipe_id),
        ):
            if valor is not None:
                registro = self.db.get(model, valor)
                partes.append(f"{rotulo} {registro.nome if registro else valor}")
        if f.meus:
            partes.append("meus planos")
        if f.periodo:
            partes.append(f"criados de {f.periodo.inicio:%d/%m/%Y} a {f.periodo.fim:%d/%m/%Y}")
        # Exibição sempre explícita (indicadores de planos ativos não contam arquivados).
        partes.append(
            {
                FiltroArquivados.EXCLUIR: "exibição: ativos",
                FiltroArquivados.SOMENTE: "exibição: arquivados",
                FiltroArquivados.INCLUIR: "exibição: todos (ativos e arquivados)",
            }[f.arquivados]
        )
        return partes

    # ---- detalhe -----------------------------------------------------------------

    def _obter(self, plano_id: int) -> PlanoDeAcao:
        plano = self.repo.obter_visivel(plano_id)
        if plano is None:
            # 404 também para planos fora do escopo: não revela que o id existe.
            raise PlanoNaoEncontrado
        return plano

    def _indicadores(self, plano_id: int) -> IndicadoresAcoes:
        return calcular_indicadores(self.repo.dados_indicadores(plano_id), self.hoje)

    def indicadores(self, plano_id: int) -> IndicadoresPlano:
        plano = self._obter(plano_id)
        i = self._indicadores(plano_id)
        # Plano arquivado: sem situação operacional de prazo (status e prazos originais continuam).
        arquivado = plano.arquivado_em is not None
        return IndicadoresPlano(
            total_acoes=i.total,
            pendentes=i.pendentes,
            em_andamento=i.em_andamento,
            concluidas=i.concluidas,
            atrasadas=0 if arquivado else i.atrasadas,
            a_vencer=0 if arquivado else i.a_vencer,
            no_prazo=0 if arquivado else i.no_prazo,
            descartadas=i.descartadas,
            progresso=i.progresso,
            concluidas_no_prazo=i.concluidas_no_prazo,
            concluidas_com_atraso=i.concluidas_com_atraso,
            abertas_no_prazo=i.abertas_no_prazo,
            percentual_cumprimento=i.percentual_cumprimento,
        )

    def resumo(self, plano_id: int) -> PlanoResumo:
        return self._montar_resumo(self._obter(plano_id))

    def _montar_resumo(self, plano: PlanoDeAcao) -> PlanoResumo:
        i = self._indicadores(plano.id)
        contagem = {
            CategoriaAcao.PENDENTE: i.pendentes,
            CategoriaAcao.EM_ANDAMENTO: i.em_andamento,
            CategoriaAcao.CONCLUIDA: i.concluidas,
        }
        return PlanoResumo(
            id=plano.id,
            codigo=plano.codigo,
            nome=plano.nome,
            status=plano.status,
            prazo_tag=None if plano.arquivado_em else tag_prazo_plano(plano.status, plano.data_fim_estimado, self.hoje),
            atrasado_para_iniciar=plano.arquivado_em is None
            and plano_atrasado_para_iniciar(plano.status, plano.data_inicio_estimado, self.hoje),
            rascunho=plano.rascunho,
            prioridade=plano.prioridade,
            data_inicio_estimado=plano.data_inicio_estimado,
            data_fim_estimado=plano.data_fim_estimado,
            dias_para_prazo=(plano.data_fim_estimado - self.hoje).days,
            responsavel=Opcao(id=plano.responsavel.id, nome=plano.responsavel.nome),
            criado_por=Opcao(id=plano.criado_por.id, nome=plano.criado_por.nome),
            area=Opcao(id=plano.area.id, nome=plano.area.nome),
            setor=Opcao(id=plano.setor.id, nome=plano.setor.nome) if plano.setor else None,
            tipo=Opcao(id=plano.tipo.id, nome=plano.tipo.nome),
            origem=Opcao(id=plano.origem.id, nome=plano.origem.nome),
            criado_em=como_utc(plano.criado_em),
            concluido_em=como_utc(plano.concluido_em) if plano.concluido_em else None,
            arquivado_em=como_utc(plano.arquivado_em) if plano.arquivado_em else None,
            arquivado_por=Opcao(id=plano.arquivado_por.id, nome=plano.arquivado_por.nome) if plano.arquivado_por else None,
            progresso=i.progresso,
            total_acoes=i.total,
            acoes_por_categoria=[ContagemAcoes(categoria=c, total=n) for c, n in contagem.items()],
        )

    def detalhe(self, plano_id: int) -> PlanoDetalhe:
        plano = self._obter(plano_id)
        editavel = pode_editar(self.usuario, plano)
        apto = plano.arquivado_em is None and not plano.rascunho and apto_a_conclusao(plano)
        return PlanoDetalhe(
            **self._montar_resumo(plano).model_dump(),
            descricao=plano.descricao,
            descricao_problema=plano.descricao_problema,
            objetivo=plano.objetivo,
            causa=plano.causa,
            evidencias=plano.evidencias,
            observacoes=plano.observacoes,
            atualizado_em=como_utc(plano.atualizado_em),
            permissoes=PermissoesPlano(
                editar=editavel,
                arquivar=pode_arquivar(self.usuario),
                adicionar_acoes=editavel,
                enviar_anexos=editavel,
                excluir=pode_excluir(self.usuario, plano),
                concluir=apto and pode_concluir(self.usuario, plano),
            ),
            apto_conclusao=apto,
        )

    def acoes(self, plano_id: int) -> list[AcaoDoPlano]:
        """Ações e subações (acao_pai_id), na ordem da numeração. Arquivadas vêm marcadas (a tela decide mostrar)."""
        from app.services.acao_service import AcaoService

        plano = self._obter(plano_id)
        papeis = AcaoService(self.db, self.usuario, self.hoje)
        plano_arquivado = plano.arquivado_em is not None

        def operacoes(a) -> OperacoesAcao:
            fora = plano_arquivado or a.arquivado_em is not None
            pode_abrir = papeis._eh_gestor(a) or papeis._eh_responsavel(a) or "planos:editar" in self.usuario.codigos_permissao
            return OperacoesAcao(editar=not fora and pode_abrir, **papeis.operacoes(a))

        return [
            AcaoDoPlano(
                id=a.id,
                numero=a.numero_exibicao,
                acao_pai_id=a.acao_pai_id,
                nivel=a.nivel,
                subacoes_diretas=len(a.subacoes),
                total_descendentes=len(a.descendentes()),
                descricao=a.descricao,
                responsavel=Opcao(id=a.responsavel_id, nome=nome),
                area=Opcao(id=a.area.id, nome=a.area.nome),
                setor=Opcao(id=a.setor.id, nome=a.setor.nome) if a.setor else None,
                prazo_inicio=a.prazo_inicio,
                prazo=a.prazo,
                prioridade=a.prioridade,
                status=a.status,
                categoria=categoria_acao(a.status, a.prazo, self.hoje),
                vencendo=not (plano_arquivado or a.arquivado_em) and acao_vencendo(a.status, a.prazo, self.hoje),
                progresso=a.progresso,
                observacao=a.observacao,
                aceita_em=como_utc(a.aceita_em) if a.aceita_em else None,
                iniciada_em=como_utc(a.iniciada_em) if a.iniciada_em else None,
                concluida_em=como_utc(a.concluida_em) if a.concluida_em else None,
                criado_em=como_utc(a.criado_em),
                depende_de=[dependencias.ref(p) for p in a.depende_de],
                aguardando=[dependencias.ref(p) for p in dependencias.pendentes(a)],
                # Plano ou ação arquivados: sem "Em atraso/A vencer/No prazo" (o prazo original continua).
                prazo_tag=None if (plano_arquivado or a.arquivado_em) else tag_prazo_acao(a.status, a.prazo, self.hoje),
                revisar_prerequisito=dependencias.revisar_prerequisito(a),
                arquivada=a.arquivado_em is not None,
                operacoes=operacoes(a),
            )
            for a, nome in self.repo.acoes_detalhadas(plano_id)
        ]

    def historico(self, plano_id: int, page: int, page_size: int) -> Pagina[EventoTimeline]:
        """Timeline consolidada: histórico do plano, das ações e envios de anexos, do mais recente ao mais antigo."""
        self._obter(plano_id)
        eventos: list[EventoTimeline] = []
        for h, usuario in self.repo.historico_plano(plano_id):
            eventos.append(
                EventoTimeline(
                    id=f"p-{h.id}", origem="plano", evento=h.evento.value, campo_alterado=h.campo_alterado,
                    valor_anterior=h.valor_anterior, valor_novo=h.valor_novo,
                    usuario=Opcao(id=h.usuario_id, nome=usuario) if h.usuario_id is not None else None,
                    motivo=h.motivo, acao=None, anexo_nome=None, criado_em=como_utc(h.criado_em),
                )
            )
        for h, usuario, descricao in self.repo.historico_acoes(plano_id):
            eventos.append(
                EventoTimeline(
                    id=f"a-{h.id}", origem="acao", evento=h.evento.value, campo_alterado=h.campo_alterado,
                    valor_anterior=h.valor_anterior, valor_novo=h.valor_novo,
                    usuario=Opcao(id=h.usuario_id, nome=usuario), acao=Opcao(id=h.acao_id, nome=descricao),
                    anexo_nome=None, criado_em=como_utc(h.criado_em),
                )
            )
        for anexo, usuario in self.repo.anexos_com_autor(plano_id):
            eventos.append(
                EventoTimeline(
                    id=f"x-{anexo.id}", origem="anexo", evento="envio", campo_alterado=None,
                    valor_anterior=None, valor_novo=None, usuario=Opcao(id=anexo.enviado_por_id, nome=usuario),
                    acao=None, anexo_nome=anexo.nome_arquivo, criado_em=como_utc(anexo.criado_em),
                )
            )
        # Um plano tem dezenas/centenas de eventos: ordenar e paginar em memória é suficiente.
        # Desempate por id numérico (eventos gravados no mesmo segundo mantêm a ordem de gravação).
        eventos.sort(key=lambda e: (e.criado_em, int(e.id.split("-", 1)[1])), reverse=True)
        inicio = (page - 1) * page_size
        return Pagina[EventoTimeline](
            items=eventos[inicio : inicio + page_size], total=len(eventos), page=page, page_size=page_size
        )

    # ---- opções para filtros -------------------------------------------------------

    def origens_do_tipo(self, tipo_id: int) -> list[Opcao]:
        """Origens ativas compatíveis com o tipo (formulário do plano). 404 se o tipo não existir."""
        tipo = self.db.get(TipoPlano, tipo_id)
        if tipo is None:
            raise PlanoNaoEncontrado
        return [Opcao(id=o.id, nome=o.nome) for o in tipo.origens if o.ativo]

    def opcoes(self) -> OpcoesPlanos:
        def lista(model) -> list[Opcao]:
            return [
                Opcao(id=i, nome=n)
                for i, n in self.db.execute(select(model.id, model.nome).where(model.ativo.is_(True)).order_by(model.nome))
            ]

        setores = self.db.execute(
            select(Setor.id, Setor.nome, Setor.area_id).where(Setor.ativo.is_(True)).order_by(Setor.nome)
        )
        return OpcoesPlanos(
            responsaveis=lista(Usuario),
            areas=lista(Area),
            setores=[SetorOpcao(id=i, nome=n, area_id=a) for i, n, a in setores],
            tipos=lista(TipoPlano),
            origens=lista(OrigemPlano),
        )
