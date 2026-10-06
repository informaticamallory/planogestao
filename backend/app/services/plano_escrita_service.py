"""Criação de planos, inclusão de ações e anexos."""

import mimetypes
import re
import uuid
from datetime import date
from pathlib import PurePath
from typing import BinaryIO

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import utcnow
from app.core.tempo import como_utc
from app.models import Acao, Area, OrigemPlano, PlanoAnexo, PlanoDeAcao, Setor, TipoPlano, Usuario
from app.models.enums import (
    STATUS_ACAO_ABERTOS,
    STATUS_ACAO_DESCARTADOS,
    EventoHistorico,
    EventoPlano,
    ReferenciaNotificacao,
    StatusAcao,
    StatusPlano,
)
from app.schemas.comum import Opcao
from app.schemas.plano import (
    AcaoCriar,
    AcaoResumo,
    AcoesAdicionadas,
    AnexoResumo,
    PlanoAtualizado,
    PlanoAtualizar,
    PlanoCriado,
    PlanoCriar,
    PlanoDadosBase,
    PlanoDetalhe,
)
from app.services.alertas_prazo import verificar_acao
from app.services import dependencias
from app.services.armazenamento import Armazenamento
from app.services.email_notificacoes import enfileirar_criacao_item, enfileirar_criacao_plano
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.escopo import MENSAGEM_SEM_ACESSO_AREA, filtro_planos_visiveis
from app.services.ciclo_plano import apto_a_conclusao, concluir_manualmente, recalcular_status
from app.services.historico import registrar_historico, registrar_historico_plano
from app.services.indicadores import calcular_indicadores
from app.services.permissoes_plano import pode_arquivar, pode_concluir, pode_excluir, tem_autoria_ou_edicao
from app.services.plano_codigo import gerar_codigo_plano
from app.services.pontuacao import creditar_conclusao_acao, creditar_conclusao_plano, reverter_por_reabertura
from app.services.plano_service import PlanoNaoEncontrado, PlanoService
from app.services.regras import categoria_acao, tag_prazo_acao

MAX_ARQUIVOS_POR_ENVIO = 10
EXTENSOES_PERMITIDAS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
    ".txt", ".csv", ".zip",
}


class RegraNegocio(Exception):
    """Violação de regra que depende do banco (vira 422)."""


class SemPermissao(Exception):
    pass


def _formatar(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _nome_seguro(nome: str | None) -> str:
    """Só o nome-base, sem caracteres de controle, com no máximo 255 caracteres."""
    base = PurePath((nome or "arquivo").replace("\\", "/")).name
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip() or "arquivo"
    if len(base) > 255:
        ext = PurePath(base).suffix[:20]
        base = base[: 255 - len(ext)] + ext
    return base


class _LeitorLimitado:
    """Envolve o arquivo enviado e interrompe a gravação ao passar do limite."""

    def __init__(self, origem: BinaryIO, limite: int):
        self.origem = origem
        self.limite = limite
        self.lidos = 0

    def read(self, n: int = -1) -> bytes:
        bloco = self.origem.read(n)
        self.lidos += len(bloco)
        if self.lidos > self.limite:
            raise RegraNegocio(f"Arquivo excede o limite de {self.limite // (1024 * 1024)} MB.")
        return bloco


class PlanoEscritaService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje
        self.leitura = PlanoService(db, usuario, hoje)

    # ---- validações que dependem do banco ----------------------------------------

    def _exigir_ativo(self, model, id_: int | None, rotulo: str):
        registro = self.db.get(model, id_) if id_ is not None else None
        if registro is None or not registro.ativo:
            raise RegraNegocio(f"{rotulo} inválido(a) ou inativo(a).")
        return registro

    def _validar_area_setor(self, area_id: int, setor_id: int | None, rotulo: str) -> None:
        self._exigir_ativo(Area, area_id, f"Área {rotulo}")
        if setor_id is not None:
            setor = self._exigir_ativo(Setor, setor_id, f"Função/Cargo {rotulo}")
            if setor.area_id != area_id:
                raise RegraNegocio(f"A função/cargo {rotulo} não pertence à área selecionada.")

    def _validar_acoes(
        self, acoes: list[AcaoCriar], data_fim_estimado: date, plano_id: int | None = None, pai: Acao | None = None
    ) -> tuple[list[str], list[list[Acao]]]:
        """Valida as ações (ou subações de `pai`) de um envio — a mesma regra em todos os níveis.
        Devolve os avisos e, por item, os pré-requisitos já cadastrados."""
        avisos: list[str] = []
        existentes: list[list[Acao]] = []
        for i, acao in enumerate(acoes, start=1):
            self._exigir_ativo(Usuario, acao.responsavel_id, f"Responsável da ação {i}")
            self._validar_area_setor(acao.area_id, acao.setor_id, f"da ação {i}")
            if acao.prazo > data_fim_estimado:
                avisos.append(
                    f"Ação {i}: prazo {_formatar(acao.prazo)} é posterior ao fim estimado do plano ({_formatar(data_fim_estimado)})."
                )
            if pai is not None and acao.prazo > pai.prazo:
                avisos.append(
                    f"Sub-item {i}: prazo {_formatar(acao.prazo)} é posterior ao prazo do item acima ({_formatar(pai.prazo)})."
                )
            if any(j < 0 or j >= len(acoes) for j in acao.depende_de_novas):
                raise RegraNegocio(f"Ação {i}: pré-requisito inexistente.")
            if i - 1 in acao.depende_de_novas:
                raise RegraNegocio(f"Ação {i}: uma ação não pode depender dela mesma.")
            if acao.depende_de and plano_id is None:
                raise RegraNegocio(f"Ação {i}: pré-requisito inexistente.")
            prereqs, erro = dependencias.validar_prerequisitos(self.db, plano_id or 0, None, acao.depende_de, pai=pai)
            if erro:
                raise RegraNegocio(f"Ação {i}: {erro}")
            existentes.append(prereqs)

        if dependencias.ciclo_entre_novas([a.depende_de_novas for a in acoes]):
            raise RegraNegocio("Dependência circular entre as ações (ex.: a Ação 1 depende da 2 e a 2 depende da 1).")

        # Cadastrar já iniciada exige os pré-requisitos concluídos — os próprios e os dos itens acima.
        bloqueios_de_cima = dependencias.pendentes(pai) if pai is not None else []
        for i, acao in enumerate(acoes):
            if acao.status not in dependencias.STATUS_DE_INICIO and acao.progresso == 0:
                continue
            pendente = (
                bool(bloqueios_de_cima)
                or any(p.status != StatusAcao.CONCLUIDA for p in existentes[i])
                or any(acoes[j].status != "concluida" for j in acao.depende_de_novas)
            )
            if pendente:
                raise RegraNegocio(
                    f"Ação {i + 1}: aguardando ação anterior — ela só pode ser cadastrada iniciada depois da conclusão dos pré-requisitos."
                )
        return avisos, existentes

    # ---- criação ---------------------------------------------------------------------

    def _validar_identificacao(self, dados: PlanoDadosBase, plano: PlanoDeAcao | None = None) -> None:
        tipo = self._exigir_ativo(TipoPlano, dados.tipo_id, "Tipo de plano")
        origem = self._exigir_ativo(OrigemPlano, dados.origem_id, "Origem")
        # Origem precisa ser compatível com o tipo (Administração › Tipos de Plano). Na edição, só quando
        # tipo ou origem mudam: planos antigos continuam editáveis mesmo se a compatibilidade mudar depois.
        mudou = plano is None or plano.tipo_id != dados.tipo_id or plano.origem_id != dados.origem_id
        if mudou and origem not in tipo.origens:
            raise RegraNegocio(f"A origem “{origem.nome}” não é compatível com o tipo “{tipo.nome}”.")
        if dados.area_id is not None:
            self._validar_area_setor(dados.area_id, dados.setor_id, "do plano")
        self._exigir_ativo(Usuario, dados.responsavel_id, "Responsável")

    # ---- acesso por área ------------------------------------------------------------------

    def _exigir_acesso_area(self, usuario_id: int, area_id: int) -> None:
        """Responsável (plano, ação ou sub-item) precisa ter a área do plano entre as autorizadas."""
        usuario = self.db.get(Usuario, usuario_id)
        if usuario is not None and not usuario.acessa_area(area_id):
            raise RegraNegocio(f"{usuario.nome}: {MENSAGEM_SEM_ACESSO_AREA}")

    def _exigir_area_do_autor(self, area_id: int) -> None:
        # Sem isso, quem cria/edita perderia o acesso ao próprio plano logo depois de salvar.
        if not self.usuario.acessa_area(area_id):
            raise RegraNegocio(
                "Você não possui acesso à área do plano. Solicite ao Administrador a atualização das áreas autorizadas."
            )

    def _area_do_plano(self, dados: PlanoCriar) -> tuple[int, int | None]:
        """A área/setor do plano (visibilidade e indicadores): a informada, a da 1ª ação ou a do responsável."""
        if dados.area_id is not None:
            return dados.area_id, dados.setor_id
        if dados.acoes:
            return dados.acoes[0].area_id, dados.acoes[0].setor_id
        responsavel = self.db.get(Usuario, dados.responsavel_id)
        if responsavel is None or responsavel.area_id is None:
            raise RegraNegocio("Cadastre ao menos uma ação com área (ou defina a área do responsável pelo plano).")
        return responsavel.area_id, None

    def _historico_plano(self, plano: PlanoDeAcao, evento: EventoPlano, campo=None, anterior=None, novo=None) -> None:
        registrar_historico_plano(self.db, plano, self.usuario.id, evento, campo, anterior, novo)

    def criar(self, dados: PlanoCriar) -> PlanoCriado:
        self._validar_identificacao(dados)
        avisos, _ = self._validar_acoes(dados.acoes, dados.data_fim_estimado)
        area_id, setor_id = self._area_do_plano(dados)
        self._exigir_area_do_autor(area_id)
        for responsavel_id in dict.fromkeys([dados.responsavel_id, *(a.responsavel_id for a in dados.acoes)]):
            self._exigir_acesso_area(responsavel_id, area_id)

        assert dados.data_inicio_estimado is not None  # preenchida pelo validador
        plano = PlanoDeAcao(
            codigo=gerar_codigo_plano(self.db, self.hoje.year),
            nome=dados.nome,
            tipo_id=dados.tipo_id,
            origem_id=dados.origem_id,
            area_id=area_id,
            setor_id=setor_id,
            responsavel_id=dados.responsavel_id,
            criado_por_id=self.usuario.id,
            data_inicio_estimado=dados.data_inicio_estimado,
            data_fim_estimado=dados.data_fim_estimado,
            prioridade=dados.prioridade,
            status=StatusPlano.NAO_INICIADO,  # recalculado logo abaixo, pelas ações
            rascunho=dados.rascunho,
            descricao=dados.descricao,
            descricao_problema=dados.descricao_problema,
            objetivo=dados.objetivo,
            causa=dados.causa,
            evidencias=dados.evidencias,
            observacoes=dados.observacoes,
        )
        self.db.add(plano)
        self.db.flush()
        self._historico_plano(plano, EventoPlano.CRIACAO, "status", None, plano.status)
        if plano.rascunho:
            self._historico_plano(plano, EventoPlano.CRIACAO, "rascunho", None, "sim")
        else:
            # E-mail ao responsável (sai só depois do commit; em rascunho, na liberação).
            enfileirar_criacao_plano(self.db, plano, self.usuario)
        acoes = self._criar_acoes(plano, dados.acoes, [[] for _ in dados.acoes], primeiro_numero=1)
        # Ações cadastradas já iniciadas/concluídas mudam o status calculado (histórico do Sistema).
        recalcular_status(self.db, plano, self.usuario.id)
        # Plano, ações e histórico no mesmo commit: ou grava tudo, ou nada.
        self.db.commit()

        return PlanoCriado(
            plano=self.leitura.resumo(plano.id), acoes=[self._acao_resumo(a) for a in acoes], avisos=avisos
        )

    def _criar_acoes(
        self,
        plano: PlanoDeAcao,
        lista: list[AcaoCriar],
        existentes: list[list[Acao]],
        primeiro_numero: int,
        pai: Acao | None = None,
    ) -> list[Acao]:
        """Cria as ações (ou subações de `pai`) de um envio, numeração sequencial, e liga os pré-requisitos."""
        criadas = [self._criar_acao(plano, a, primeiro_numero + i, pai) for i, a in enumerate(lista)]
        for acao, dados, prereqs in zip(criadas, lista, existentes):
            acao.depende_de = [*prereqs, *(criadas[j] for j in dict.fromkeys(dados.depende_de_novas))]
            if acao.depende_de:
                registrar_historico(
                    self.db, acao, self.usuario.id, EventoHistorico.CRIACAO, "depende_de", None,
                    ", ".join(dependencias.rotulo(p) for p in acao.depende_de),
                )
        return criadas

    def _criar_acao(self, plano: PlanoDeAcao, dados: AcaoCriar, numero: int, pai: Acao | None = None) -> Acao:
        agora = utcnow()
        status = StatusAcao(dados.status)
        acao = Acao(
            plano=plano,
            acao_pai=pai,
            numero=numero,
            descricao=dados.descricao,
            responsavel_id=dados.responsavel_id,
            area_id=dados.area_id,
            setor_id=dados.setor_id,
            prazo_inicio=dados.prazo_inicio,
            prazo=dados.prazo,
            prioridade=dados.prioridade,
            status=status,
            progresso=dados.progresso,
            observacao=dados.observacao,
            criado_por_id=self.usuario.id,
            aceita_em=agora if status != StatusAcao.AGUARDANDO_ACEITE else None,
            iniciada_em=agora if status in dependencias.STATUS_DE_INICIO or dados.progresso > 0 else None,
            concluida_em=agora if status == StatusAcao.CONCLUIDA else None,
        )
        self.db.add(acao)
        # Auditoria: a criação registra status e progresso iniciais (e, na subação, de qual item ela veio).
        registrar_historico(
            self.db, acao, self.usuario.id, EventoHistorico.CRIACAO, "status", None, status,
            detalhe=f"Sub-item de {dependencias.rotulo(pai)}." if pai is not None else None,
        )
        if dados.progresso:
            registrar_historico(self.db, acao, self.usuario.id, EventoHistorico.CRIACAO, "progresso", None, dados.progresso)
        # Em rascunho a ação ainda não foi liberada: o aviso sai quando o plano for liberado.
        if not plano.rascunho:
            self.db.flush()
            self._avisar_atribuicao(acao)
        # Ação cadastrada já concluída também é uma entrega: credita o executor.
        creditar_conclusao_acao(self.db, acao)
        return acao

    def _avisar_atribuicao(self, acao: Acao) -> None:
        """Avisos da criação de uma ação/sub-item (ou da liberação do rascunho em que ela foi criada)."""
        plano = acao.plano
        # E-mail de criação: responsável (e, no sub-item, o responsável pelo pai), qualquer status.
        enfileirar_criacao_item(self.db, acao, self.usuario)
        if acao.status in STATUS_ACAO_ABERTOS:
            tipo = f"o sub-item {acao.numero_exibicao}" if acao.eh_subacao else "a ação"
            publicar(
                self.db,
                Evento(
                    tipo=TipoEvento.ACAO_ATRIBUIDA,
                    destinatarios=(acao.responsavel_id,),
                    autor_id=self.usuario.id,
                    titulo=f"{'Novo sub-item atribuído' if acao.eh_subacao else 'Nova ação atribuída'} a você — {plano.codigo}",
                    mensagem=f"{self.usuario.nome} atribuiu a você {tipo} “{acao.descricao}” (prazo {_formatar(acao.prazo)}).",
                    referencia_tipo=ReferenciaNotificacao.ACAO,
                    referencia_id=acao.id,
                ),
            )
        verificar_acao(self.db, acao, self.hoje)

    def _acao_resumo(self, acao: Acao) -> AcaoResumo:
        responsavel = self.db.get(Usuario, acao.responsavel_id)
        return AcaoResumo(
            id=acao.id,
            numero=acao.numero_exibicao,
            descricao=acao.descricao,
            responsavel=Opcao(id=acao.responsavel_id, nome=responsavel.nome if responsavel else "?"),
            area=Opcao(id=acao.area.id, nome=acao.area.nome),
            setor=Opcao(id=acao.setor.id, nome=acao.setor.nome) if acao.setor else None,
            prazo_inicio=acao.prazo_inicio,
            prazo=acao.prazo,
            prioridade=acao.prioridade,
            status=acao.status,
            categoria=categoria_acao(acao.status, acao.prazo, self.hoje),
            prazo_tag=tag_prazo_acao(acao.status, acao.prazo, self.hoje),
            progresso=acao.progresso,
            observacao=acao.observacao,
        )

    # ---- plano existente -------------------------------------------------------------

    def _plano_visivel(self, plano_id: int) -> PlanoDeAcao:
        plano = self.db.scalar(
            select(PlanoDeAcao).where(
                PlanoDeAcao.id == plano_id, filtro_planos_visiveis(self.usuario, incluir_arquivados=True)
            )
        )
        if plano is None:
            raise PlanoNaoEncontrado
        return plano

    def _plano_editavel(self, plano_id: int) -> PlanoDeAcao:
        plano = self._plano_visivel(plano_id)
        if not tem_autoria_ou_edicao(self.usuario, plano):
            raise SemPermissao
        if plano.arquivado_em is not None:
            raise RegraNegocio("Plano arquivado (somente leitura): desarquive-o para alterar.")
        return plano

    def criar_itens(self, plano: PlanoDeAcao, acoes: list[AcaoCriar], pai: Acao | None = None) -> tuple[list[Acao], list[str]]:
        """Inclusão de ações (pai=None) ou subações de qualquer nível: mesma validação, numeração e auditoria.
        Não faz commit (quem chama decide). A permissão sobre o plano/pai é do chamador."""
        # Trava o plano: duas inclusões simultâneas não repetem a numeração.
        self.db.execute(select(PlanoDeAcao.id).where(PlanoDeAcao.id == plano.id).with_for_update())
        avisos, existentes = self._validar_acoes(acoes, plano.data_fim_estimado, plano.id, pai=pai)
        for responsavel_id in dict.fromkeys(a.responsavel_id for a in acoes):
            self._exigir_acesso_area(responsavel_id, plano.area_id)
        primeiro = dependencias.proximo_numero(self.db, plano.id, pai.id if pai is not None else None)
        criadas = self._criar_acoes(plano, acoes, existentes, primeiro, pai=pai)
        # Nova ação pendente num plano concluído o faz voltar a em andamento (subações não mudam o status).
        recalcular_status(self.db, plano, self.usuario.id)
        return criadas, avisos

    def adicionar_acoes(self, plano_id: int, acoes: list[AcaoCriar]) -> AcoesAdicionadas:
        plano = self._plano_editavel(plano_id)
        criadas, avisos = self.criar_itens(plano, acoes)
        self.db.commit()
        return AcoesAdicionadas(acoes=[self._acao_resumo(a) for a in criadas], avisos=avisos)

    # ---- edição ---------------------------------------------------------------------------

    # Campos simples (valor gravado como está) e de relacionamento (grava o nome no histórico).
    _CAMPOS_SIMPLES = (
        "nome", "data_inicio_estimado", "data_fim_estimado", "prioridade",
        "descricao", "descricao_problema", "objetivo", "causa", "evidencias", "observacoes",
    )
    _CAMPOS_RELACAO = (
        ("tipo_id", TipoPlano), ("origem_id", OrigemPlano), ("area_id", Area), ("setor_id", Setor),
        ("responsavel_id", Usuario),
    )

    def _nome(self, model, id_: int | None) -> str | None:
        registro = self.db.get(model, id_) if id_ is not None else None
        return registro.nome if registro else None

    def _validar_rascunho(self, plano: PlanoDeAcao, rascunho: bool) -> None:
        """O status não é editável (calculado). Só se libera um rascunho; o contrário não existe."""
        if rascunho and not plano.rascunho:
            raise RegraNegocio("Um plano já liberado não volta a ser rascunho.")
        if plano.rascunho and not rascunho:
            indicadores = calcular_indicadores(self.leitura.repo.dados_indicadores(plano.id), self.hoje)
            if indicadores.total == 0:
                raise RegraNegocio("Para liberar o plano, cadastre pelo menos uma ação.")

    def atualizar(self, plano_id: int, dados: PlanoAtualizar) -> PlanoAtualizado:
        plano = self._plano_editavel(plano_id)
        self._validar_identificacao(dados, plano)
        self._validar_rascunho(plano, dados.rascunho)
        responsavel_antes, area_antes = plano.responsavel_id, plano.area_id

        # Auditoria campo a campo, na mesma transação da alteração.
        for campo in self._CAMPOS_SIMPLES:
            anterior, novo = getattr(plano, campo), getattr(dados, campo)
            if anterior != novo:
                self._historico_plano(plano, EventoPlano.ALTERACAO, campo, anterior, novo)
                setattr(plano, campo, novo)
        for campo, model in self._CAMPOS_RELACAO:
            # Área/setor não enviados: mantém os do plano (agora são escolhidos por ação).
            if campo in ("area_id", "setor_id") and dados.area_id is None:
                continue
            anterior, novo = getattr(plano, campo), getattr(dados, campo)
            if anterior != novo:
                self._historico_plano(
                    plano, EventoPlano.ALTERACAO, campo.removesuffix("_id"), self._nome(model, anterior), self._nome(model, novo)
                )
                setattr(plano, campo, novo)

        # Responsável ou área trocados: quem responde pelo plano e pelas ações precisa acessar a área.
        if plano.responsavel_id != responsavel_antes or plano.area_id != area_antes:
            self._exigir_area_do_autor(plano.area_id)
            self._exigir_acesso_area(plano.responsavel_id, plano.area_id)
        if plano.area_id != area_antes:
            for responsavel_id in dict.fromkeys(a.responsavel_id for a in plano.acoes if a.status not in STATUS_ACAO_DESCARTADOS):
                self._exigir_acesso_area(responsavel_id, plano.area_id)

        if plano.rascunho and not dados.rascunho:
            # Rascunho liberado: agora as ações valem para os responsáveis (avisos e alertas).
            self._historico_plano(plano, EventoPlano.ALTERACAO, "rascunho", "sim", "não")
            plano.rascunho = False
            enfileirar_criacao_plano(self.db, plano, self.usuario)
            for acao in plano.acoes:
                self._avisar_atribuicao(acao)
            if plano.status == StatusPlano.CONCLUIDO:
                # Concluído enquanto rascunho: os pontos e o aviso saem na liberação.
                creditar_conclusao_plano(self.db, plano)

        self.db.commit()
        self.db.refresh(plano)

        avisos = [
            f'Ação "{a.descricao}": prazo {_formatar(a.prazo)} é posterior ao novo fim estimado ({_formatar(plano.data_fim_estimado)}).'
            for a in plano.acoes
            if a.status in STATUS_ACAO_ABERTOS and a.prazo > plano.data_fim_estimado
        ]
        return PlanoAtualizado(plano=self.leitura.detalhe(plano.id), avisos=avisos)

    # ---- arquivamento --------------------------------------------------------------------

    def arquivar(self, plano_id: int, arquivar: bool) -> PlanoDetalhe:
        plano = self._plano_visivel(plano_id)
        if not pode_arquivar(self.usuario):
            raise SemPermissao
        if arquivar and plano.arquivado_em is None:
            plano.arquivado_em = utcnow()
            plano.arquivado_por_id = self.usuario.id
            self._historico_plano(plano, EventoPlano.ARQUIVAMENTO)
        elif not arquivar and plano.arquivado_em is not None:
            plano.arquivado_em = None
            plano.arquivado_por_id = None
            self._historico_plano(plano, EventoPlano.DESARQUIVAMENTO)
        self.db.commit()
        return self.leitura.detalhe(plano.id)

    def excluir(self, plano_id: int) -> None:
        """Exclusão lógica do plano com TODAS as ações e sub-itens, numa transação: nada fica aparecendo
        solto. Histórico, anexos e registros ficam no banco (auditoria). Pontos lançados: revertidos se o
        período de apuração estiver aberto, mantidos se encerrado."""
        plano = self._plano_visivel(plano_id)
        if not pode_excluir(self.usuario, plano):
            raise SemPermissao
        instante = utcnow()
        acoes = list(plano.acoes)
        self._historico_plano(plano, EventoPlano.ALTERACAO, "excluido", "não", f"sim ({len(acoes)} ação(ões)/sub-item(ns) junto)")
        for acao in acoes:
            acao.excluido_em, acao.excluido_por_id = instante, self.usuario.id
            reverter_por_reabertura(self.db, ReferenciaNotificacao.ACAO, acao.id,
                                    f"Ação {acao.numero_exibicao} do plano {plano.codigo}", self.usuario.id, None, situacao="excluído")
        plano.excluido_em, plano.excluido_por_id = instante, self.usuario.id
        reverter_por_reabertura(self.db, ReferenciaNotificacao.PLANO, plano.id, f"Plano {plano.codigo}", self.usuario.id, None,
                                situacao="excluído")
        self.db.commit()

    def concluir(self, plano_id: int, observacao: str | None) -> PlanoDetalhe:
        """Confirma a conclusão de um plano apto (ações válidas concluídas após arquivamento/exclusão):
        registra que o objetivo foi atingido e credita o gestor."""
        plano = self._plano_visivel(plano_id)
        if not pode_concluir(self.usuario, plano):
            raise SemPermissao
        if plano.rascunho or not apto_a_conclusao(plano):
            raise RegraNegocio("O plano não está apto à conclusão: ainda há ações válidas em aberto (ou nenhuma ação válida).")
        concluir_manualmente(self.db, plano, self.usuario.id, (observacao or "").strip() or None)
        self.db.commit()
        return self.leitura.detalhe(plano.id)

    # ---- anexos -------------------------------------------------------------------------

    def _anexo_resumo(self, anexo: PlanoAnexo) -> AnexoResumo:
        return AnexoResumo(
            id=anexo.id,
            nome_arquivo=anexo.nome_arquivo,
            mime_type=anexo.mime_type,
            tamanho_bytes=anexo.tamanho_bytes,
            enviado_por=Opcao(id=anexo.enviado_por.id, nome=anexo.enviado_por.nome),
            criado_em=como_utc(anexo.criado_em),
        )

    def enviar_anexos(self, plano_id: int, arquivos: list[UploadFile], armazenamento: Armazenamento) -> list[AnexoResumo]:
        plano = self._plano_editavel(plano_id)
        if not arquivos:
            raise RegraNegocio("Nenhum arquivo enviado.")
        if len(arquivos) > MAX_ARQUIVOS_POR_ENVIO:
            raise RegraNegocio(f"Envie no máximo {MAX_ARQUIVOS_POR_ENVIO} arquivos por vez.")

        preparados = []
        for arquivo in arquivos:
            nome = _nome_seguro(arquivo.filename)
            extensao = PurePath(nome).suffix.lower()
            if extensao not in EXTENSOES_PERMITIDAS:
                raise RegraNegocio(f'Tipo de arquivo não permitido: "{nome}".')
            preparados.append((arquivo, nome, extensao))

        limite = get_settings().MAX_UPLOAD_MB * 1024 * 1024
        gravadas: list[str] = []
        try:
            anexos = []
            for arquivo, nome, extensao in preparados:
                chave = f"planos/{plano.id}/{uuid.uuid4().hex}{extensao}"
                leitor = _LeitorLimitado(arquivo.file, limite)
                gravadas.append(chave)
                armazenamento.salvar(chave, leitor)
                if leitor.lidos == 0:
                    raise RegraNegocio(f'O arquivo "{nome}" está vazio.')
                anexo = PlanoAnexo(
                    plano_id=plano.id,
                    nome_arquivo=nome,
                    chave_armazenamento=chave,
                    # O tipo vem da extensão validada, não do Content-Type enviado pelo cliente.
                    mime_type=mimetypes.guess_type(nome)[0] or "application/octet-stream",
                    tamanho_bytes=leitor.lidos,
                    enviado_por_id=self.usuario.id,
                )
                self.db.add(anexo)
                anexos.append(anexo)
            self.db.commit()
        except Exception:
            # Nada fica pela metade: remove os arquivos já gravados deste envio.
            self.db.rollback()
            for chave in gravadas:
                armazenamento.remover(chave)
            raise
        return [self._anexo_resumo(a) for a in anexos]

    def listar_anexos(self, plano_id: int) -> list[AnexoResumo]:
        plano = self.leitura.repo.obter_visivel(plano_id)
        if plano is None:
            raise PlanoNaoEncontrado
        return [self._anexo_resumo(a) for a in plano.anexos]

    def obter_anexo(self, plano_id: int, anexo_id: int) -> PlanoAnexo:
        if self.leitura.repo.obter_visivel(plano_id) is None:
            raise PlanoNaoEncontrado
        anexo = self.db.get(PlanoAnexo, anexo_id)
        if anexo is None or anexo.plano_id != plano_id:
            raise PlanoNaoEncontrado
        return anexo
