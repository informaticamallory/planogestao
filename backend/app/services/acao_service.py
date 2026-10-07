"""Detalhe e fluxo da ação: execução, aceite e contraproposta de prazo.

Toda alteração passa por aqui e grava acao_historico na mesma transação.
"""

from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.tempo import como_utc
from app.models import Acao, AcaoHistorico, AcaoSolicitacaoAlteracao, Area, PlanoDeAcao, Setor, Usuario
from app.models.enums import (
    STATUS_ACAO_ABERTOS,
    EventoHistorico,
    ReferenciaNotificacao,
    StatusAcao,
    StatusPlano,
    StatusSolicitacao,
)
from app.schemas.acao import (
    AcaoAtualizada,
    AcaoAtualizar,
    AcaoDetalhe,
    AcaoHistoricoItem,
    PermissoesAcao,
    PlanoDaAcao,
    ReabrirAcao,
    ResponderSolicitacao,
    SolicitacaoResumo,
    SolicitarAlteracao,
    ItemCaminho,
    SubacaoItem,
)
from app.schemas.comum import Opcao
from app.schemas.plano import AcaoCriar, AcoesAdicionadas
from app.services import avisos, dependencias
from app.services.escopo import MENSAGEM_SEM_ACESSO_AREA, filtro_planos_visiveis
from app.services.permissoes_plano import acesso_direto
from app.services.historico import registrar_historico
from app.services.alertas_prazo import verificar_acao
from app.services.ciclo_plano import recalcular_status
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.pontuacao import creditar_conclusao_acao, reverter_por_reabertura
from app.services.regras import acao_vencendo, categoria_acao, tag_prazo_acao

PERMISSAO_APROVAR_PRAZO = "acoes:aprovar_prazo"
PERMISSAO_ARQUIVAR = "acoes:arquivar"
PERMISSAO_EXCLUIR = "acoes:excluir"

# Execução: transições que o responsável (e o gestor) podem fazer via PUT.
TRANSICOES_EXECUCAO: dict[StatusAcao, set[StatusAcao]] = {
    StatusAcao.ACEITA: {StatusAcao.EM_ANDAMENTO},
    StatusAcao.EM_ANDAMENTO: {StatusAcao.BLOQUEADA, StatusAcao.CONCLUIDA},
    StatusAcao.BLOQUEADA: {StatusAcao.EM_ANDAMENTO},
}
STATUS_COM_PROGRESSO = (StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA)
# A ação principal já foi assumida pelo responsável: ele pode desdobrá-la em subações.
STATUS_ACEITA_SUBACOES = (StatusAcao.ACEITA, StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA)


class AcaoNaoEncontrada(Exception):
    pass


class SemPermissaoAcao(Exception):
    pass


class RegraAcao(Exception):
    """Violação de regra (vira 422)."""


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


class AcaoService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje
        self._cache_acesso_direto: dict[int, bool] = {}

    # ---- acesso e papéis ------------------------------------------------------------

    def _acessivel(self, acao: Acao) -> bool:
        """Quem vê o plano vê todos os itens. O responsável por uma subação (sem acesso ao plano) vê a
        própria e as que estão abaixo dela — que ele mesmo desdobrou —, nunca as irmãs nem as de cima."""
        if self._plano_visivel(acao):
            return True
        # Fora das áreas autorizadas, nem o próprio sub-item aparece (o Administrador ajusta o acesso).
        return self.usuario.acessa_area(acao.plano.area_id) and any(
            a.responsavel_id == self.usuario.id for a in (acao, *acao.ancestrais)
        )

    def _obter(self, acao_id: int, *, bloquear: bool = False) -> Acao:
        stmt = select(Acao).where(Acao.id == acao_id)
        if bloquear:
            # Evita duas respostas/solicitações simultâneas sobre a mesma ação.
            stmt = stmt.with_for_update(of=Acao)
        acao = self.db.scalar(stmt)
        # 404 também fora do escopo: não revela que o id existe.
        if acao is None or not self._acessivel(acao):
            raise AcaoNaoEncontrada
        return acao

    def _eh_responsavel(self, acao: Acao) -> bool:
        return acao.responsavel_id == self.usuario.id

    def _eh_gestor(self, acao: Acao) -> bool:
        """Gestor do plano, quem aprova prazos ou, na subação, o responsável por qualquer item acima dela."""
        plano = acao.plano
        return (
            plano.responsavel_id == self.usuario.id
            or plano.criado_por_id == self.usuario.id
            or (PERMISSAO_APROVAR_PRAZO in self.usuario.codigos_permissao and self._acesso_direto(plano))
            or any(a.responsavel_id == self.usuario.id for a in acao.ancestrais)
        )

    def _acesso_direto(self, plano: PlanoDeAcao) -> bool:
        """Vê o plano sem contar equipes (a participação em equipe só dá leitura). Cache por plano."""
        if plano.id not in self._cache_acesso_direto:
            self._cache_acesso_direto[plano.id] = acesso_direto(self.usuario, plano)
        return self._cache_acesso_direto[plano.id]

    def _gestores_ids(self, acao: Acao) -> tuple[int, ...]:
        """Quem responde a um pedido de prazo: o responsável pelo pai imediato (a conclusão usa avisos.py)."""
        if acao.acao_pai is not None:
            return tuple(i for i in (acao.acao_pai.responsavel_id, acao.criado_por_id) if i is not None)
        return (acao.plano.responsavel_id, acao.plano.criado_por_id)

    def _plano_visivel(self, acao: Acao) -> bool:
        return (
            self.db.scalar(
                select(PlanoDeAcao.id).where(
                    PlanoDeAcao.id == acao.plano_id, filtro_planos_visiveis(self.usuario, incluir_arquivados=True)
                )
            )
            is not None
        )

    @staticmethod
    def _subacoes_pendentes(acao: Acao) -> list[Acao]:
        return [s for s in acao.subacoes if s.status in STATUS_ACAO_ABERTOS]

    def _plano_aceita_alteracoes(self, acao: Acao) -> bool:
        # Plano concluído continua aceitando mudanças (ex.: reabrir uma ação); arquivado é somente leitura.
        # Ação arquivada (ou abaixo de uma arquivada) também: desarquive antes de alterar.
        return acao.plano.arquivado_em is None and acao.arquivado_em is None

    def _exigir_plano_ativo(self, acao: Acao) -> None:
        if acao.plano.arquivado_em is not None:
            raise RegraAcao("O plano desta ação está arquivado (somente leitura). Desarquive-o para alterar.")
        if acao.arquivado_em is not None:
            raise RegraAcao("Esta ação está arquivada (somente leitura). Desarquive-a para alterar.")


    def _pendente(self, acao: Acao) -> AcaoSolicitacaoAlteracao | None:
        return next((s for s in acao.solicitacoes if s.status == StatusSolicitacao.PENDENTE), None)

    def _transicoes(self, acao: Acao) -> list[StatusAcao]:
        if not self._plano_aceita_alteracoes(acao):
            return []
        permitidas: set[StatusAcao] = set()
        if self._eh_responsavel(acao) or self._eh_gestor(acao):
            permitidas |= TRANSICOES_EXECUCAO.get(acao.status, set())
        if self._eh_gestor(acao) and acao.status in STATUS_ACAO_ABERTOS:
            permitidas.add(StatusAcao.CANCELADA)
        # Aguardando ação anterior: pode aceitar e editar, mas não iniciar.
        if acao.status == StatusAcao.ACEITA and dependencias.pendentes(acao):
            permitidas.discard(StatusAcao.EM_ANDAMENTO)
        return sorted(permitidas, key=lambda s: list(StatusAcao).index(s))

    def _permissoes(self, acao: Acao) -> PermissoesAcao:
        ativo = self._plano_aceita_alteracoes(acao)
        aberta = acao.status in STATUS_ACAO_ABERTOS
        responsavel, gestor = self._eh_responsavel(acao), self._eh_gestor(acao)
        pendente = self._pendente(acao)
        return PermissoesAcao(
            editar_planejamento=ativo and aberta and gestor,
            adicionar_subacao=(
                # Qualquer nível pode ser desdobrado (subação da subação…).
                ativo
                and not acao.plano.rascunho
                and acao.status in STATUS_ACEITA_SUBACOES
                and (responsavel or gestor)
            ),
            eh_responsavel=responsavel,
            eh_gestor=gestor,
            aceitar=ativo and responsavel and acao.status == StatusAcao.AGUARDANDO_ACEITE and pendente is None,
            solicitar_alteracao=ativo and responsavel and aberta and pendente is None,
            responder_solicitacao=ativo and gestor and pendente is not None and pendente.solicitado_por_id != self.usuario.id,
            editar_execucao=ativo and aberta and (responsavel or gestor) and acao.status != StatusAcao.AGUARDANDO_ACEITE,
            editar_prazo=ativo and aberta and gestor,
            reabrir=ativo and gestor and acao.status == StatusAcao.CONCLUIDA and self._erro_reabrir(acao) is None,
            transicoes=self._transicoes(acao),
            **self.operacoes(acao),
        )

    # ---- arquivar / desarquivar / excluir -------------------------------------------------

    def _pode(self, acao: Acao, codigo: str) -> bool:
        """Permissão do perfil + papel no item (gestor do plano/item ou "Editar planos"); plano ativo."""
        codigos = self.usuario.codigos_permissao
        return (
            codigo in codigos
            and (self._eh_gestor(acao) or ("planos:editar" in codigos and self._acesso_direto(acao.plano)))
            and acao.plano.arquivado_em is None
        )

    def operacoes(self, acao: Acao) -> dict[str, bool]:
        arquivada = acao.arquivado_em is not None
        pai_arquivado = acao.acao_pai is not None and acao.acao_pai.arquivado_em is not None
        return dict(
            arquivar=not arquivada and self._pode(acao, PERMISSAO_ARQUIVAR),
            desarquivar=arquivada and not pai_arquivado and self._pode(acao, PERMISSAO_ARQUIVAR),
            excluir=self._pode(acao, PERMISSAO_EXCLUIR),
        )

    def arquivar(self, acao_id: int, arquivar: bool) -> AcaoDetalhe:
        """Arquiva a ação e os sub-itens abaixo (mesmo instante). Status e prazos originais ficam; ela sai das
        listas operacionais e do cálculo do plano. Arquivar não conclui o plano nem gera pontos."""
        acao = self._obter(acao_id, bloquear=True)
        if acao.plano.arquivado_em is not None:
            raise RegraAcao("O plano está arquivado (somente leitura): desarquive o plano antes.")
        if not self._pode(acao, PERMISSAO_ARQUIVAR):
            raise SemPermissaoAcao
        rotulo = "o sub-item" if acao.eh_subacao else "a ação"
        if arquivar:
            if acao.arquivado_em is not None:
                raise RegraAcao("Este item já está arquivado.")
            instante = utcnow().replace(microsecond=0)  # o DATETIME do MySQL arredonda a fração
            # O instante identifica o que foi arquivado junto: nunca igual ao de um sub-item arquivado à parte.
            anteriores = [d.arquivado_em for d in acao.descendentes() if d.arquivado_em is not None]
            if anteriores and instante <= max(anteriores):
                instante = max(anteriores) + timedelta(seconds=1)
            for item in (acao, *acao.descendentes()):
                if item.arquivado_em is None:
                    item.arquivado_em, item.arquivado_por_id = instante, self.usuario.id
                    detalhe = "Arquivada." if item is acao else f"Arquivado junto com {rotulo} {acao.numero_exibicao}."
                    self._registrar(item, "arquivada", "não", "sim", detalhe=detalhe)
        else:
            if acao.arquivado_em is None:
                raise RegraAcao("Este item não está arquivado.")
            if acao.acao_pai is not None and acao.acao_pai.arquivado_em is not None:
                raise RegraAcao("O item acima também está arquivado: desarquive-o antes.")
            instante = acao.arquivado_em
            # Volta o que foi arquivado junto; um sub-item arquivado antes, à parte, continua arquivado.
            for item in (acao, *acao.descendentes()):
                if item.arquivado_em == instante:
                    item.arquivado_em = item.arquivado_por_id = None
                    self._registrar(item, "arquivada", "sim", "não", detalhe="Desarquivada.")
        recalcular_status(self.db, acao.plano, self.usuario.id, por_retirada=True)
        self.db.commit()
        self.db.refresh(acao)
        return self._detalhe(acao)

    def excluir(self, acao_id: int) -> None:
        """Exclusão lógica da ação e de todos os sub-itens abaixo, numa transação. O histórico fica; os pontos
        já lançados são revertidos se o período de apuração estiver aberto (mantidos se encerrado)."""
        acao = self._obter(acao_id, bloquear=True)
        if acao.plano.arquivado_em is not None:
            raise RegraAcao("O plano está arquivado (somente leitura): desarquive o plano antes.")
        if not self._pode(acao, PERMISSAO_EXCLUIR):
            raise SemPermissaoAcao
        plano = acao.plano
        instante = utcnow()
        itens = [acao, *acao.descendentes()]
        for item in itens:
            self._registrar(item, "excluida", "não", "sim",
                            detalhe="Excluída." if item is acao else f"Excluído junto com {acao.numero_exibicao}.")
            item.excluido_em, item.excluido_por_id = instante, self.usuario.id
            reverter_por_reabertura(
                self.db, ReferenciaNotificacao.ACAO, item.id, f"Ação {item.numero_exibicao} do plano {plano.codigo}",
                self.usuario.id, None, situacao="excluído",
            )
        self.db.flush()
        # A coleção plano.acoes já carregada ainda tem os excluídos: recarrega antes de recalcular o status.
        self.db.expire(plano, ["acoes"])
        recalcular_status(self.db, plano, self.usuario.id, por_retirada=True)
        self.db.commit()

    @staticmethod
    def _erro_reabrir(acao: Acao) -> str | None:
        if acao.status != StatusAcao.CONCLUIDA:
            return "Só é possível reabrir uma ação concluída."
        if acao.acao_pai is not None and acao.acao_pai.status == StatusAcao.CONCLUIDA:
            # Um item concluído não pode ter subação pendente: reabre-se de cima para baixo.
            pai = acao.acao_pai
            return f"O item acima ({'Sub-item' if pai.eh_subacao else 'Ação'} {pai.numero_exibicao}) está concluído: reabra-o antes."
        return None

    # ---- leitura ------------------------------------------------------------------------

    def _solicitacao(self, s: AcaoSolicitacaoAlteracao) -> SolicitacaoResumo:
        return SolicitacaoResumo(
            id=s.id,
            prazo_anterior=s.prazo_anterior,
            novo_prazo_sugerido=s.novo_prazo_sugerido,
            motivo=s.motivo,
            status=s.status,
            feita_antes_do_aceite=s.feita_antes_do_aceite,
            solicitado_por=Opcao(id=s.solicitado_por.id, nome=s.solicitado_por.nome),
            respondido_por=Opcao(id=s.respondido_por.id, nome=s.respondido_por.nome) if s.respondido_por else None,
            resposta_justificativa=s.resposta_justificativa,
            respondido_em=como_utc(s.respondido_em) if s.respondido_em else None,
            criado_em=como_utc(s.criado_em),
        )

    def _subacao_item(self, s: Acao) -> SubacaoItem:
        return SubacaoItem(
            **dependencias.ref(s).model_dump(),
            responsavel=Opcao(id=s.responsavel.id, nome=s.responsavel.nome),
            area=Opcao(id=s.area.id, nome=s.area.nome),
            setor=Opcao(id=s.setor.id, nome=s.setor.nome) if s.setor else None,
            prazo_inicio=s.prazo_inicio,
            prazo=s.prazo,
            categoria=categoria_acao(s.status, s.prazo, self.hoje),
            prazo_tag=None if (s.arquivado_em or s.plano.arquivado_em) else tag_prazo_acao(s.status, s.prazo, self.hoje),
            progresso=s.progresso,
            subacoes_diretas=len(s.subacoes),
            total_descendentes=len(s.descendentes()),
        )

    def _detalhe(self, acao: Acao) -> AcaoDetalhe:
        plano = acao.plano
        fora_de_operacao = plano.arquivado_em is not None or acao.arquivado_em is not None
        pendente = self._pendente(acao)
        plano_visivel = self._plano_visivel(acao)
        origem = acao.acao_pai
        # Caminho de origem (ação principal → … → pai imediato), com o que o usuário pode abrir.
        caminho = [
            ItemCaminho(**dependencias.ref(a).model_dump(), acessivel=self._acessivel(a)) for a in acao.caminho
        ]
        return AcaoDetalhe(
            id=acao.id,
            numero=acao.numero_exibicao,
            nivel=acao.nivel,
            descricao=acao.descricao,
            plano=PlanoDaAcao(
                id=plano.id, codigo=plano.codigo, nome=plano.nome, status=plano.status, data_fim_estimado=plano.data_fim_estimado,
                arquivado=plano.arquivado_em is not None,
            ),
            plano_visivel=plano_visivel,
            caminho=caminho,
            acao_origem=dependencias.ref(origem) if origem else None,
            acao_origem_acessivel=bool(caminho) and caminho[-1].acessivel,
            responsavel=Opcao(id=acao.responsavel.id, nome=acao.responsavel.nome),
            criado_por=Opcao(id=acao.criado_por.id, nome=acao.criado_por.nome) if acao.criado_por else None,
            area=Opcao(id=acao.area.id, nome=acao.area.nome),
            setor=Opcao(id=acao.setor.id, nome=acao.setor.nome) if acao.setor else None,
            prazo_inicio=acao.prazo_inicio,
            prazo=acao.prazo,
            prioridade=acao.prioridade,
            status=acao.status,
            categoria=categoria_acao(acao.status, acao.prazo, self.hoje),
            vencendo=not fora_de_operacao and acao_vencendo(acao.status, acao.prazo, self.hoje),
            dias_para_prazo=(acao.prazo - self.hoje).days,
            progresso=acao.progresso,
            observacao=acao.observacao,
            motivo_bloqueio=acao.motivo_bloqueio,
            motivo_recusa=acao.motivo_recusa,
            motivo_cancelamento=acao.motivo_cancelamento,
            aceita_em=como_utc(acao.aceita_em) if acao.aceita_em else None,
            iniciada_em=como_utc(acao.iniciada_em) if acao.iniciada_em else None,
            concluida_em=como_utc(acao.concluida_em) if acao.concluida_em else None,
            criado_em=como_utc(acao.criado_em),
            atualizado_em=como_utc(acao.atualizado_em),
            depende_de=[dependencias.ref(p) for p in acao.depende_de],
            aguardando=[dependencias.ref(p) for p in dependencias.pendentes(acao)],
            revisar_prerequisito=dependencias.revisar_prerequisito(acao),
            # Plano ou ação arquivados: sem situação operacional de prazo (o prazo original continua visível).
            prazo_tag=None if fora_de_operacao else tag_prazo_acao(acao.status, acao.prazo, self.hoje),
            arquivada=acao.arquivado_em is not None,
            arquivada_em=como_utc(acao.arquivado_em) if acao.arquivado_em else None,
            # Subações diretas (cada uma com a contagem das suas); o responsável de cima acompanha as de baixo.
            subacoes=[self._subacao_item(s) for s in acao.subacoes],
            subacoes_pendentes=len(self._subacoes_pendentes(acao)),
            total_descendentes=len(acao.descendentes()),
            solicitacao_pendente=self._solicitacao(pendente) if pendente else None,
            solicitacoes=[self._solicitacao(s) for s in reversed(acao.solicitacoes)],
            permissoes=self._permissoes(acao),
        )

    def detalhe(self, acao_id: int) -> AcaoDetalhe:
        return self._detalhe(self._obter(acao_id))

    def historico(self, acao_id: int) -> list[AcaoHistoricoItem]:
        acao = self._obter(acao_id)
        linhas = self.db.execute(
            select(AcaoHistorico, Usuario.nome)
            .join(Usuario, AcaoHistorico.usuario_id == Usuario.id)
            .where(AcaoHistorico.acao_id == acao.id)
            .order_by(AcaoHistorico.criado_em.desc(), AcaoHistorico.id.desc())
        )
        return [
            AcaoHistoricoItem(
                id=h.id, evento=h.evento, campo_alterado=h.campo_alterado, valor_anterior=h.valor_anterior,
                valor_novo=h.valor_novo, detalhe=h.detalhe, usuario=Opcao(id=h.usuario_id, nome=nome),
                criado_em=como_utc(h.criado_em),
            )
            for h, nome in linhas
        ]

    # ---- alterações -----------------------------------------------------------------------

    def _registrar(self, acao: Acao, campo: str, anterior, novo, evento=EventoHistorico.ALTERACAO, detalhe=None):
        return registrar_historico(self.db, acao, self.usuario.id, evento, campo, anterior, novo, detalhe=detalhe)

    def _mudar_status(self, acao: Acao, novo: StatusAcao, detalhe: str | None = None) -> None:
        self._registrar(acao, "status", acao.status, novo, detalhe=detalhe)
        acao.status = novo
        agora = utcnow()
        if novo == StatusAcao.ACEITA and acao.aceita_em is None:
            acao.aceita_em = agora
        if novo == StatusAcao.EM_ANDAMENTO and acao.iniciada_em is None:
            acao.iniciada_em = agora  # início real (o estimado é prazo_inicio)
        if novo == StatusAcao.CONCLUIDA:
            acao.concluida_em = agora
            if acao.progresso != 100:
                self._registrar(acao, "progresso", acao.progresso, 100)
                acao.progresso = 100

    def _apos_mudanca(self, acao: Acao, status_anterior: StatusAcao, prazo_anterior: date) -> None:
        """Eventos derivados de uma mudança já aplicada (mesma transação)."""
        if acao.status == StatusAcao.CONCLUIDA and status_anterior != StatusAcao.CONCLUIDA:
            self.db.flush()
            avisos.acao_concluida(self.db, acao, self.usuario)
            # Quem dependia desta (direto ou por um item acima) e não tem mais pendência: só o aviso.
            avisos.dependencias_liberadas(self.db, acao, self.usuario)
            creditar_conclusao_acao(self.db, acao)
        # Mudou status ou prazo: reavalia na hora se a ação entrou em "vencendo"/"atrasada".
        if acao.status != status_anterior or acao.prazo != prazo_anterior:
            verificar_acao(self.db, acao, self.hoje)
        # Status global do plano: sempre recalculado pelas ações (com histórico do Sistema).
        if acao.status != status_anterior:
            recalcular_status(self.db, acao.plano, self.usuario.id)

    def atualizar(self, acao_id: int, dados: AcaoAtualizar) -> AcaoAtualizada:
        acao = self._obter(acao_id)
        self._exigir_plano_ativo(acao)
        perm = self._permissoes(acao)
        enviados = dados.model_fields_set
        avisos_tela: list[str] = []
        status_anterior, prazo_anterior = acao.status, acao.prazo
        datas_antes = (acao.prazo_inicio, acao.prazo)
        self._hist_datas = None
        self._troca = None
        motivo_prazo = (dados.motivo_alteracao_prazo or "").strip() or None

        if not (perm.eh_responsavel or perm.eh_gestor):
            raise SemPermissaoAcao
        if acao.status not in STATUS_ACAO_ABERTOS:
            raise RegraAcao("Ação concluída, recusada ou cancelada não pode ser alterada.")

        # Prazo: só gestores alteram direto; o responsável usa a solicitação de alteração.
        if "prazo" in enviados and dados.prazo is not None and dados.prazo != acao.prazo:
            if not perm.editar_prazo:
                raise RegraAcao("Para mudar o prazo, use “Solicitar alteração”: a mudança precisa ser aprovada pelo gestor.")
            if self._pendente(acao):
                raise RegraAcao("Há uma solicitação de prazo pendente: responda-a antes de alterar o prazo.")
            inicio = dados.prazo_inicio if "prazo_inicio" in enviados and dados.prazo_inicio else acao.prazo_inicio
            if inicio is not None and inicio > dados.prazo:
                raise RegraAcao("O prazo inicial estimado não pode ser posterior ao prazo de conclusão.")
            self._hist_datas = self._registrar(acao, "prazo", acao.prazo, dados.prazo, detalhe=motivo_prazo)
            acao.prazo = dados.prazo
            if acao.prazo > acao.plano.data_fim_estimado:
                avisos_tela.append(
                    f"O novo prazo ({_fmt(acao.prazo)}) é posterior ao fim estimado do plano ({_fmt(acao.plano.data_fim_estimado)})."
                )

        self._atualizar_planejamento(acao, dados, perm, avisos_tela, motivo_prazo)

        if "status" in enviados and dados.status is not None and dados.status != acao.status:
            # Regras de dependência antes das transições, para a mensagem dizer o motivo.
            # Só bloqueia o INÍCIO: se um pré-requisito foi reaberto depois, a ação já iniciada segue
            # (fica sinalizada para revisão em `revisar_prerequisito`).
            bloqueios = dependencias.pendentes(acao)
            if dados.status in dependencias.STATUS_DE_INICIO and bloqueios and acao.iniciada_em is None:
                raise RegraAcao(dependencias.mensagem_aguardando(acao, bloqueios))
            if dados.status not in perm.transicoes:
                if acao.status == StatusAcao.AGUARDANDO_ACEITE and self._eh_responsavel(acao):
                    raise RegraAcao("Aceite a ação (ou solicite alteração) antes de iniciá-la.")
                raise RegraAcao(f"Mudança de status não permitida: {acao.status.value} → {dados.status.value}.")
            if dados.status == StatusAcao.CONCLUIDA and (abertas := self._subacoes_pendentes(acao)):
                raise RegraAcao(
                    f"Não é possível concluir: há {len(abertas)} sub-item(ns) pendente(s) "
                    f"({', '.join(s.numero_exibicao for s in abertas)}). Conclua ou cancele-os antes."
                )
            if dados.status == StatusAcao.BLOQUEADA:
                if not dados.motivo_bloqueio:
                    raise RegraAcao("Informe o motivo do bloqueio.")
                acao.motivo_bloqueio = dados.motivo_bloqueio
            detalhe = dados.motivo_bloqueio if dados.status == StatusAcao.BLOQUEADA else None
            if dados.status == StatusAcao.CANCELADA:
                detalhe = self._preparar_cancelamento(acao, dados.justificativa)
            self._mudar_status(acao, dados.status, detalhe=detalhe)

        if "progresso" in enviados and dados.progresso is not None and dados.progresso != acao.progresso:
            if acao.status not in STATUS_COM_PROGRESSO:
                raise RegraAcao("O progresso só pode ser alterado com a ação em andamento ou bloqueada.")
            if not perm.editar_execucao:
                raise SemPermissaoAcao
            self._registrar(acao, "progresso", acao.progresso, dados.progresso)
            acao.progresso = dados.progresso

        if "observacao" in enviados and (dados.observacao or None) != acao.observacao:
            self._registrar(acao, "observacao", acao.observacao, dados.observacao or None)
            acao.observacao = dados.observacao or None

        if self._hist_datas is not None:
            self.db.flush()
            avisos.prazo_alterado_item(self.db, acao, self.usuario, datas_antes, motivo_prazo, self._hist_datas.id)
        if self._troca is not None:
            anterior, hist = self._troca
            self.db.flush()
            avisos.acao_atribuida_na_troca(self.db, acao, self.usuario, anterior, hist.id)
            # O aviso de prazo próximo é por responsável: o novo é avaliado na hora.
            if acao.prazo == prazo_anterior and acao.status == status_anterior:
                verificar_acao(self.db, acao, self.hoje)
        self._apos_mudanca(acao, status_anterior, prazo_anterior)
        self.db.commit()
        self.db.refresh(acao)
        return AcaoAtualizada(acao=self._detalhe(acao), avisos=avisos_tela)

    # ---- planejamento, cancelamento e subações ------------------------------------------------

    def _area_setor_validos(self, area_id: int, setor_id: int | None) -> tuple[Area, Setor | None]:
        area = self.db.get(Area, area_id)
        if area is None or not area.ativo:
            raise RegraAcao("Área inválida ou inativa.")
        setor = self.db.get(Setor, setor_id) if setor_id is not None else None
        if setor_id is not None and (setor is None or not setor.ativo):
            raise RegraAcao("Função/cargo inválida ou inativa.")
        if setor is not None and setor.area_id != area.id:
            raise RegraAcao("A função/cargo informada não pertence à área selecionada.")
        return area, setor

    def _atualizar_planejamento(
        self, acao: Acao, dados: AcaoAtualizar, perm: PermissoesAcao, avisos_tela: list[str], motivo_prazo: str | None = None
    ) -> None:
        """Prazo inicial estimado, responsável, área/função-cargo e pré-requisitos. Só gestores; cada mudança vai
        para o histórico."""
        enviados = dados.model_fields_set

        def exigir_gestor() -> None:
            if not perm.editar_planejamento:
                raise SemPermissaoAcao

        if "prazo_inicio" in enviados and dados.prazo_inicio is not None and dados.prazo_inicio != acao.prazo_inicio:
            exigir_gestor()
            if dados.prazo_inicio > acao.prazo:
                raise RegraAcao("O prazo inicial estimado não pode ser posterior ao prazo de conclusão.")
            self._hist_datas = self._registrar(acao, "prazo_inicio", acao.prazo_inicio, dados.prazo_inicio, detalhe=motivo_prazo)
            acao.prazo_inicio = dados.prazo_inicio

        if "responsavel_id" in enviados and dados.responsavel_id is not None and dados.responsavel_id != acao.responsavel_id:
            exigir_gestor()
            self._trocar_responsavel(acao, dados.responsavel_id)

        nova_area = dados.area_id if "area_id" in enviados and dados.area_id is not None else acao.area_id
        if "setor_id" in enviados:
            novo_setor = dados.setor_id
        else:
            novo_setor = acao.setor_id if nova_area == acao.area_id else None
        if nova_area != acao.area_id or novo_setor != acao.setor_id:
            exigir_gestor()
            area, setor = self._area_setor_validos(nova_area, novo_setor)
            if nova_area != acao.area_id:
                self._registrar(acao, "area", acao.area.nome, area.nome)
            if novo_setor != acao.setor_id:
                self._registrar(acao, "setor", acao.setor.nome if acao.setor else None, setor.nome if setor else None)
            acao.area_id, acao.setor_id = nova_area, novo_setor
            self.db.flush()
            self.db.refresh(acao, ["area", "setor"])

        if "depende_de" in enviados and dados.depende_de is not None:
            atuais = {p.id for p in acao.depende_de}
            if set(dados.depende_de) == atuais:
                return
            exigir_gestor()
            # Subações também têm pré-requisitos próprios (e seguem os dos itens acima delas).
            prereqs, erro = dependencias.validar_prerequisitos(self.db, acao.plano_id, acao.id, dados.depende_de)
            if erro:
                raise RegraAcao(erro)
            iniciada = acao.iniciada_em is not None or acao.status in dependencias.STATUS_DE_INICIO
            novos_pendentes = [p for p in prereqs if p.id not in atuais and p.status != StatusAcao.CONCLUIDA]
            if iniciada and novos_pendentes:
                raise RegraAcao("A ação já foi iniciada: só é possível vincular pré-requisitos já concluídos.")
            rotulos = lambda lista: ", ".join(dependencias.rotulo(p) for p in lista) or None  # noqa: E731
            self._registrar(acao, "depende_de", rotulos(acao.depende_de), rotulos(prereqs))
            acao.depende_de = prereqs

    def _trocar_responsavel(self, acao: Acao, novo_id: int) -> None:
        """Novo responsável pelo item: conta ativa (sem convite pendente) com a área do plano entre as autorizadas.
        Status, prazos e pontos não mudam; o histórico registra quem saiu e quem entrou, e o novo responsável é
        avisado ("Ação atribuída")."""
        novo = self.db.get(Usuario, novo_id)
        if novo is None or not novo.ativo or novo.convite_pendente:
            raise RegraAcao("Responsável inválido ou inativo.")
        if not novo.acessa_area(acao.plano.area_id):
            raise RegraAcao(f"{novo.nome}: {MENSAGEM_SEM_ACESSO_AREA}")
        if self._pendente(acao):
            raise RegraAcao("Há uma solicitação de prazo pendente: responda-a antes de trocar o responsável.")
        anterior = acao.responsavel
        hist = self._registrar(acao, "responsavel", anterior.nome if anterior else None, novo.nome)
        acao.responsavel_id = novo.id
        self.db.flush()
        self.db.refresh(acao, ["responsavel"])
        self._troca = (anterior, hist)

    def _preparar_cancelamento(self, acao: Acao, justificativa: str | None) -> str | None:
        """Valida o cancelamento e cancela junto as subações abertas. Devolve o detalhe do histórico."""
        if dependentes := dependencias.dependentes_abertos(acao):
            nomes = "; ".join(dependencias.rotulo(d) for d in dependentes)
            raise RegraAcao(f"Esta ação é pré-requisito de {nomes}. Remova o vínculo nessas ações antes de cancelá-la.")
        if acao.eh_subacao and not justificativa:
            raise RegraAcao("Informe a justificativa do cancelamento do sub-item.")
        acao.motivo_cancelamento = justificativa or None
        # O item cancelado leva junto todas as subações abertas abaixo dele, em qualquer nível
        # (continuam no histórico, com o motivo).
        for sub in acao.descendentes():
            if sub.status not in STATUS_ACAO_ABERTOS:
                continue
            motivo = f"Cancelado junto com {dependencias.rotulo(acao)}."
            registrar_historico(
                self.db, sub, self.usuario.id, EventoHistorico.ALTERACAO, "status", sub.status, StatusAcao.CANCELADA,
                detalhe=motivo,
            )
            sub.status = StatusAcao.CANCELADA
            sub.motivo_cancelamento = motivo[:500]
        return justificativa or None

    def criar_subacoes(self, acao_id: int, itens: list[AcaoCriar]) -> AcoesAdicionadas:
        """Desdobra um item (de qualquer nível) em subações, com o MESMO formulário/validações das ações.
        O vínculo é o id do pai imediato; a numeração (1.2.1…) é só visual."""
        pai = self._obter(acao_id, bloquear=True)
        self._exigir_plano_ativo(pai)
        if not (self._eh_responsavel(pai) or self._eh_gestor(pai)):
            raise SemPermissaoAcao
        if pai.plano.rascunho:
            raise RegraAcao("O plano ainda é rascunho: libere-o antes de criar sub-itens.")
        if pai.status == StatusAcao.AGUARDANDO_ACEITE:
            raise RegraAcao("Aceite o item antes de desdobrá-lo em sub-itens.")
        if pai.status not in STATUS_ACEITA_SUBACOES:
            raise RegraAcao("Só é possível criar sub-itens em itens aceitos, em andamento ou bloqueados.")
        if not itens:
            raise RegraAcao("Informe ao menos um sub-item.")

        from app.services.plano_escrita_service import PlanoEscritaService, RegraNegocio  # evita import circular

        escrita = PlanoEscritaService(self.db, self.usuario, self.hoje)
        try:
            criadas, avisos_tela = escrita.criar_itens(pai.plano, itens, pai=pai)
        except RegraNegocio as exc:
            raise RegraAcao(str(exc)) from None
        for sub in criadas:
            self._registrar(pai, "subacao", None, f"{sub.numero_exibicao} — {sub.descricao}", detalhe="Sub-item criado.")
        self.db.commit()
        return AcoesAdicionadas(acoes=[escrita._acao_resumo(s) for s in criadas], avisos=avisos_tela)

    def reabrir(self, acao_id: int, dados: ReabrirAcao) -> AcaoDetalhe:
        """Gestor volta uma ação concluída para em andamento (justificativa no histórico).
        O plano é recalculado (concluído → em andamento) e dependentes já iniciados ficam para revisão."""
        acao = self._obter(acao_id, bloquear=True)
        self._exigir_plano_ativo(acao)
        if not self._eh_gestor(acao):
            raise SemPermissaoAcao
        if erro := self._erro_reabrir(acao):
            raise RegraAcao(erro)
        self._mudar_status(acao, StatusAcao.EM_ANDAMENTO, detalhe=f"Reaberta: {dados.justificativa}")
        acao.concluida_em = None  # a conclusão anterior continua no histórico
        reverter_por_reabertura(
            self.db, ReferenciaNotificacao.ACAO, acao.id, f"Ação {acao.numero_exibicao} do plano {acao.plano.codigo}",
            self.usuario.id, dados.justificativa,
        )
        publicar(
            self.db,
            Evento(
                tipo=TipoEvento.ACAO_ATRIBUIDA,
                destinatarios=(acao.responsavel_id,),
                autor_id=self.usuario.id,
                titulo=f"Ação reaberta — {acao.plano.codigo}",
                mensagem=(
                    f"{self.usuario.nome} reabriu {'o sub-item' if acao.eh_subacao else 'a ação'} "
                    f"{acao.numero_exibicao} “{acao.descricao}”. Motivo: {dados.justificativa}"
                ),
                referencia_tipo=ReferenciaNotificacao.ACAO,
                referencia_id=acao.id,
            ),
        )
        self._apos_mudanca(acao, StatusAcao.CONCLUIDA, acao.prazo)
        self.db.commit()
        self.db.refresh(acao)
        return self._detalhe(acao)

    def aceitar(self, acao_id: int) -> AcaoDetalhe:
        acao = self._obter(acao_id, bloquear=True)
        self._exigir_plano_ativo(acao)
        if not self._eh_responsavel(acao):
            raise SemPermissaoAcao
        if acao.status != StatusAcao.AGUARDANDO_ACEITE:
            raise RegraAcao("Só é possível aceitar ações aguardando aceite.")
        if self._pendente(acao):
            raise RegraAcao("Há uma solicitação de prazo pendente: aguarde a resposta do gestor.")
        self._mudar_status(acao, StatusAcao.ACEITA)
        self._apos_mudanca(acao, StatusAcao.AGUARDANDO_ACEITE, acao.prazo)
        self.db.commit()
        self.db.refresh(acao)
        return self._detalhe(acao)

    def solicitar_alteracao(self, acao_id: int, dados: SolicitarAlteracao) -> AcaoDetalhe:
        acao = self._obter(acao_id, bloquear=True)
        self._exigir_plano_ativo(acao)
        if not self._eh_responsavel(acao):
            raise SemPermissaoAcao
        if acao.status not in STATUS_ACAO_ABERTOS:
            raise RegraAcao("Só é possível solicitar alteração de ações em aberto.")
        if self._pendente(acao):
            raise RegraAcao("Já existe uma solicitação pendente para esta ação.")
        if dados.novo_prazo_sugerido == acao.prazo:
            raise RegraAcao("O prazo sugerido é igual ao prazo atual.")
        if dados.novo_prazo_sugerido < self.hoje:
            raise RegraAcao("O prazo sugerido não pode estar no passado.")

        solicitacao = AcaoSolicitacaoAlteracao(
            acao=acao,
            prazo_anterior=acao.prazo,
            novo_prazo_sugerido=dados.novo_prazo_sugerido,
            motivo=dados.motivo,
            feita_antes_do_aceite=acao.status == StatusAcao.AGUARDANDO_ACEITE,
            solicitado_por_id=self.usuario.id,
        )
        self.db.add(solicitacao)
        self._registrar(
            acao, "prazo", acao.prazo, dados.novo_prazo_sugerido, evento=EventoHistorico.SOLICITACAO, detalhe=dados.motivo
        )
        plano = acao.plano
        publicar(
            self.db,
            Evento(
                tipo=TipoEvento.SOLICITACAO_PRAZO,
                destinatarios=self._gestores_ids(acao),
                autor_id=self.usuario.id,
                titulo=f"Solicitação de alteração de prazo — {plano.codigo}",
                mensagem=(
                    f"{self.usuario.nome} sugeriu mudar o prazo da ação “{acao.descricao}” "
                    f"de {_fmt(acao.prazo)} para {_fmt(dados.novo_prazo_sugerido)}. Motivo: {dados.motivo}"
                ),
                referencia_tipo=ReferenciaNotificacao.ACAO,
                referencia_id=acao.id,
            ),
        )
        self.db.commit()
        self.db.refresh(acao)
        return self._detalhe(acao)

    def responder_solicitacao(self, acao_id: int, solicitacao_id: int, dados: ResponderSolicitacao) -> AcaoDetalhe:
        acao = self._obter(acao_id, bloquear=True)
        self._exigir_plano_ativo(acao)
        solicitacao = self.db.get(AcaoSolicitacaoAlteracao, solicitacao_id)
        if solicitacao is None or solicitacao.acao_id != acao.id:
            raise AcaoNaoEncontrada
        if not self._eh_gestor(acao):
            raise SemPermissaoAcao
        if solicitacao.solicitado_por_id == self.usuario.id:
            raise RegraAcao("Você não pode responder a sua própria solicitação.")
        if solicitacao.status != StatusSolicitacao.PENDENTE:
            raise RegraAcao("Esta solicitação já foi respondida.")

        justificativa = (dados.justificativa or "").strip() or None
        status_anterior, prazo_anterior = acao.status, acao.prazo
        solicitacao.status = StatusSolicitacao.ACEITA if dados.aprovado else StatusSolicitacao.RECUSADA
        solicitacao.respondido_por_id = self.usuario.id
        solicitacao.respondido_em = utcnow()
        solicitacao.resposta_justificativa = justificativa

        self._registrar(
            acao, "prazo", solicitacao.prazo_anterior, solicitacao.novo_prazo_sugerido,
            evento=EventoHistorico.RESPOSTA_SOLICITACAO,
            detalhe=("Aprovada" if dados.aprovado else "Recusada") + (f": {justificativa}" if justificativa else ""),
        )
        hist_prazo = None
        datas_antes = (acao.prazo_inicio, acao.prazo)
        if dados.aprovado:
            hist_prazo = self._registrar(acao, "prazo", acao.prazo, solicitacao.novo_prazo_sugerido, detalhe=solicitacao.motivo)
            acao.prazo = solicitacao.novo_prazo_sugerido
            # Contraproposta feita antes do aceite: aprovada, a condição do responsável foi atendida.
            if solicitacao.feita_antes_do_aceite and acao.status == StatusAcao.AGUARDANDO_ACEITE:
                self._mudar_status(acao, StatusAcao.ACEITA, detalhe="Aceite automático ao aprovar a contraproposta de prazo.")

        resultado, verbo = ("aprovada", "aprovou") if dados.aprovado else ("recusada", "recusou")
        publicar(
            self.db,
            Evento(
                tipo=TipoEvento.RESPOSTA_SOLICITACAO_PRAZO,
                destinatarios=(solicitacao.solicitado_por_id,),
                autor_id=self.usuario.id,
                titulo=f"Solicitação de prazo {resultado} — {acao.plano.codigo}",
                mensagem=(
                    f"{self.usuario.nome} {verbo} sua solicitação para a ação “{acao.descricao}”. "
                    f"Prazo vigente: {_fmt(acao.prazo)}." + (f" Justificativa: {justificativa}" if justificativa else "")
                ),
                referencia_tipo=ReferenciaNotificacao.ACAO,
                referencia_id=acao.id,
            ),
        )
        if hist_prazo is not None:
            self.db.flush()
            avisos.prazo_alterado_item(
                self.db, acao, self.usuario, datas_antes, solicitacao.motivo, hist_prazo.id, excluir=(solicitacao.solicitado_por_id,)
            )
        self._apos_mudanca(acao, status_anterior, prazo_anterior)
        self.db.commit()
        self.db.refresh(acao)
        return self._detalhe(acao)
