"""Equipes de trabalho vinculadas a planos de ação.

- Toda equipe nova é de um plano; um plano pode ter várias equipes e um usuário pode estar em várias.
- A área da equipe é a do plano. Os participantes podem ter lotações e funções/cargos diferentes.
- Participante novo: conta ativa (sem convite pendente), perfil com "Visualizar planos" e a área do plano entre
  as autorizadas. Participar dá só LEITURA do plano (escopo.participa_por_equipe): nenhuma área ou permissão nova.
- Coordenador: um dos participantes. Papel interno da equipe; não altera o perfil de acesso.
- Ver: Administrador; quem gerencia as equipes do plano; participantes que têm acesso ao plano.
- Gerenciar: permissoes_plano.pode_gerenciar_equipes. Plano arquivado: equipes só para consulta.
- Equipe sem plano (cadastro antigo): Administrador e quem tem "Gerenciar equipes" na área dela; a edição permite
  vincular um plano (regularização), nunca automaticamente.
- Criar uma equipe não muda o gestor do plano nem os responsáveis pelas ações. A exclusão é lógica e também não
  mexe em plano, ações, responsáveis ou usuários. Tudo vai para equipe_historico (autor e data).
- Desempenho: só as ações principais do plano da equipe atribuídas aos participantes; nada de outros planos.
  Participação e coordenação não geram pontos (a gamificação não conhece equipes).
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, and_, exists, false, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import Acao, Equipe, EquipeHistorico, EquipeMembro, PlanoDeAcao, Usuario
from app.services.erros import Conflito, NaoEncontrado, Proibido, RegraInvalida
from app.services.escopo import MENSAGEM_SEM_ACESSO_AREA, filtro_areas_autorizadas, filtro_planos_visiveis
from app.services.indicadores import IndicadoresAcoes, calcular_indicadores
from app.services.permissoes_plano import pode_gerenciar_equipes

GERENCIAR = "equipes:gerenciar"
LIMITE_OPCOES = 20
LIMITE_ARVORE = 500  # equipes por consulta da árvore (acima disso: refinar os filtros)

MENSAGEM_ARQUIVADO = "O plano desta equipe está arquivado: a equipe fica só para consulta. Desarquive o plano para alterá-la."


class Evento:
    CRIACAO = "criacao"
    EDICAO = "edicao"
    VINCULO_PLANO = "vinculo_plano"
    PARTICIPANTES = "participantes"
    COORDENADOR = "coordenador"
    ATIVACAO = "ativacao"
    INATIVACAO = "inativacao"
    EXCLUSAO = "exclusao"


@dataclass(frozen=True)
class FiltrosEquipes:
    q: str = ""  # nome da equipe
    plano: str = ""  # código ou nome do plano
    participante: str = ""  # nome ou e-mail
    plano_id: int | None = None
    area_id: int | None = None
    situacao: str | None = None  # ativas | inativas | sem_plano
    planos: str = "todos"  # todos | ativos | arquivados


@dataclass(frozen=True)
class DadosEquipe:
    nome: str
    plano_id: int | None
    descricao: str | None
    participantes: tuple[int, ...]
    coordenador_id: int
    ativo: bool


def _nomes(usuarios: list[Usuario]) -> str:
    return ", ".join(u.nome for u in sorted(usuarios, key=lambda u: u.nome.casefold()))


class EquipesService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje

    # ---- visibilidade e permissão ---------------------------------------------------------------

    def _gerencia_plano_da_equipe(self) -> ColumnElement[bool]:
        """O plano da equipe (linha externa) é um que o usuário gerencia — mesma regra de pode_gerenciar_equipes."""
        u = self.usuario
        if GERENCIAR not in u.codigos_permissao:
            return false()
        condicoes = [PlanoDeAcao.id == Equipe.plano_id, filtro_planos_visiveis(u, incluir_arquivados=True, via_equipe=False)]
        if not u.eh_administrador and "planos:editar" not in u.codigos_permissao:
            condicoes.append(or_(PlanoDeAcao.responsavel_id == u.id, PlanoDeAcao.criado_por_id == u.id))
        return exists(select(PlanoDeAcao.id).where(*condicoes)).correlate(Equipe)

    def filtro_visiveis(self) -> ColumnElement[bool]:
        u = self.usuario
        # Plano excluído (logicamente) leva as equipes junto: o filtro global esconde o plano.
        if u.eh_administrador:
            plano_existe = exists(select(PlanoDeAcao.id).where(PlanoDeAcao.id == Equipe.plano_id)).correlate(Equipe)
            return or_(Equipe.plano_id.is_(None), plano_existe)
        plano_visivel = exists(
            select(PlanoDeAcao.id).where(PlanoDeAcao.id == Equipe.plano_id, filtro_planos_visiveis(u, incluir_arquivados=True))
        ).correlate(Equipe)
        participa = exists(
            select(EquipeMembro.usuario_id).where(EquipeMembro.equipe_id == Equipe.id, EquipeMembro.usuario_id == u.id)
        ).correlate(Equipe)
        com_plano = and_(Equipe.plano_id.is_not(None), plano_visivel, or_(participa, self._gerencia_plano_da_equipe()))
        if GERENCIAR not in u.codigos_permissao:
            return com_plano
        sem_plano = and_(Equipe.plano_id.is_(None), filtro_areas_autorizadas(u, Equipe.area_id))
        return or_(com_plano, sem_plano)

    def ids_visiveis(self, somente_ativas: bool = False) -> set[int]:
        stmt = select(Equipe.id).where(self.filtro_visiveis())
        if somente_ativas:
            stmt = stmt.where(Equipe.ativo.is_(True))
        return set(self.db.scalars(stmt))

    def obter(self, equipe_id: int) -> Equipe:
        equipe = self.db.scalar(select(Equipe).where(Equipe.id == equipe_id, self.filtro_visiveis()))
        if equipe is None:
            raise NaoEncontrado("Equipe não encontrada.")
        return equipe

    def pode_gerenciar(self, equipe: Equipe) -> bool:
        if GERENCIAR not in self.usuario.codigos_permissao:
            return False
        if equipe.plano_id is None:
            return self.usuario.acessa_area(equipe.area_id)
        return equipe.plano is not None and pode_gerenciar_equipes(self.usuario, equipe.plano)

    @staticmethod
    def somente_leitura(equipe: Equipe) -> str | None:
        if equipe.plano is not None and equipe.plano.arquivado_em is not None:
            return "Plano arquivado: equipe disponível só para consulta."
        return None

    def _obter_gerenciavel(self, equipe_id: int) -> Equipe:
        equipe = self.obter(equipe_id)
        if equipe.plano is not None and equipe.plano.arquivado_em is not None:
            raise RegraInvalida(MENSAGEM_ARQUIVADO)
        if not self.pode_gerenciar(equipe):
            raise Proibido("Você não gerencia as equipes deste plano.")
        return equipe

    def _plano_gerenciavel(self, plano_id: int) -> PlanoDeAcao:
        plano = self.db.scalar(select(PlanoDeAcao).where(PlanoDeAcao.id == plano_id))
        if plano is not None and plano.arquivado_em is not None:
            raise RegraInvalida("O plano selecionado está arquivado: não aceita novas equipes nem alterações.")
        if plano is None or not pode_gerenciar_equipes(self.usuario, plano):
            raise RegraInvalida("Selecione um plano de ação que você gerencia.")
        return plano

    # ---- leitura ------------------------------------------------------------------------------

    def contagem_membros(self, ids: list[int]) -> dict[int, int]:
        if not ids:
            return {}
        return dict(
            self.db.execute(
                select(EquipeMembro.equipe_id, func.count()).where(EquipeMembro.equipe_id.in_(ids)).group_by(EquipeMembro.equipe_id)
            ).all()
        )

    def _consulta(self, f: FiltrosEquipes):
        """Equipes visíveis com os filtros da página (os mesmos na Lista e na Árvore)."""
        stmt = select(Equipe).outerjoin(PlanoDeAcao, PlanoDeAcao.id == Equipe.plano_id).where(self.filtro_visiveis())
        if termo := f.q.strip():
            stmt = stmt.where(Equipe.nome.contains(termo, autoescape=True))
        if termo := f.plano.strip():
            stmt = stmt.where(or_(PlanoDeAcao.codigo.contains(termo, autoescape=True), PlanoDeAcao.nome.contains(termo, autoescape=True)))
        if termo := f.participante.strip():
            # Equipes com um participante cujo nome ou e-mail contém o termo (a equipe vem inteira, com o contexto).
            stmt = stmt.where(exists(
                select(EquipeMembro.usuario_id).join(Usuario, Usuario.id == EquipeMembro.usuario_id).where(
                    EquipeMembro.equipe_id == Equipe.id,
                    or_(Usuario.nome.contains(termo, autoescape=True), Usuario.email.contains(termo, autoescape=True)),
                )
            ).correlate(Equipe))
        if f.plano_id is not None:
            stmt = stmt.where(Equipe.plano_id == f.plano_id)
        if f.area_id is not None:
            stmt = stmt.where(func.coalesce(PlanoDeAcao.area_id, Equipe.area_id) == f.area_id)
        if f.situacao == "ativas":
            stmt = stmt.where(Equipe.ativo.is_(True))
        elif f.situacao == "inativas":
            stmt = stmt.where(Equipe.ativo.is_(False))
        elif f.situacao == "sem_plano":
            stmt = stmt.where(Equipe.plano_id.is_(None))
        # Consulta histórica: equipes de planos arquivados entram por padrão; o filtro restringe.
        if f.planos == "ativos":
            stmt = stmt.where(or_(Equipe.plano_id.is_(None), PlanoDeAcao.arquivado_em.is_(None)))
        elif f.planos == "arquivados":
            stmt = stmt.where(PlanoDeAcao.arquivado_em.is_not(None))
        return stmt

    def listar(self, f: FiltrosEquipes, page: int, page_size: int) -> tuple[list[Equipe], int]:
        stmt = self._consulta(f)
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        ordem = (Equipe.ativo.desc(), PlanoDeAcao.codigo.desc(), Equipe.nome, Equipe.id)
        itens = list(self.db.scalars(stmt.order_by(*ordem).offset((page - 1) * page_size).limit(page_size)).unique())
        return itens, total

    def arvore(self, f: FiltrosEquipes, limite: int = LIMITE_ARVORE) -> dict:
        """Plano → equipes → participantes, com os filtros da página. Usa só os vínculos reais (equipe_membros):
        a mesma pessoa em várias equipes é o mesmo usuário; os totais contam pessoas distintas, sem somar equipes."""
        stmt = self._consulta(f)
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        ordem = (PlanoDeAcao.codigo.desc(), Equipe.ativo.desc(), Equipe.nome, Equipe.id)
        equipes = list(self.db.scalars(stmt.order_by(*ordem).limit(limite)).unique())
        membros: dict[int, list[EquipeMembro]] = {e.id: [] for e in equipes}
        if equipes:
            for m in self.db.scalars(
                select(EquipeMembro).join(Usuario, Usuario.id == EquipeMembro.usuario_id)
                .where(EquipeMembro.equipe_id.in_(list(membros))).order_by(Usuario.nome)
            ).unique():
                membros[m.equipe_id].append(m)
        termo = f.participante.strip().casefold()
        grupos: dict[int | None, dict] = {}
        for e in equipes:
            g = grupos.setdefault(e.plano_id, dict(plano=e.plano, equipes=[], pessoas=set()))
            participantes = membros[e.id]
            g["pessoas"].update(m.usuario_id for m in participantes)
            g["equipes"].append(dict(
                equipe=e, participantes=participantes,
                correspondem={m.usuario_id for m in participantes
                              if termo and (termo in m.usuario.nome.casefold() or termo in m.usuario.email.casefold())},
            ))
        # Planos na ordem da consulta; as equipes antigas (sem plano) por último.
        ordenados = [g for k, g in grupos.items() if k is not None] + ([grupos[None]] if None in grupos else [])
        for g in ordenados:
            g["pode_criar_equipe"] = g["plano"] is not None and pode_gerenciar_equipes(self.usuario, g["plano"])
        pessoas = set().union(*(g["pessoas"] for g in ordenados)) if ordenados else set()
        return dict(grupos=ordenados, total_equipes=total, total_pessoas=len(pessoas), truncado=total > len(equipes))

    def participantes(self, equipe: Equipe) -> list[EquipeMembro]:
        return list(
            self.db.scalars(
                select(EquipeMembro)
                .join(Usuario, EquipeMembro.usuario_id == Usuario.id)
                .where(EquipeMembro.equipe_id == equipe.id)
                .order_by(Usuario.nome)
            ).unique()
        )

    def historico(self, equipe_id: int) -> list[EquipeHistorico]:
        self.obter(equipe_id)
        return list(
            self.db.scalars(select(EquipeHistorico).where(EquipeHistorico.equipe_id == equipe_id).order_by(EquipeHistorico.id.desc()))
        )

    # ---- opções do formulário -----------------------------------------------------------------

    def planos_gerenciaveis(self, q: str, plano_id: int | None) -> list[PlanoDeAcao]:
        """Planos ativos (não arquivados) cujas equipes o usuário pode criar, com busca por código ou nome."""
        u = self.usuario
        stmt = select(PlanoDeAcao).where(filtro_planos_visiveis(u, via_equipe=False))
        if not u.eh_administrador and "planos:editar" not in u.codigos_permissao:
            stmt = stmt.where(or_(PlanoDeAcao.responsavel_id == u.id, PlanoDeAcao.criado_por_id == u.id))
        if plano_id is not None:
            stmt = stmt.where(PlanoDeAcao.id == plano_id)
        if termo := q.strip():
            stmt = stmt.where(or_(PlanoDeAcao.codigo.contains(termo, autoescape=True), PlanoDeAcao.nome.contains(termo, autoescape=True)))
        return list(self.db.scalars(stmt.order_by(PlanoDeAcao.criado_em.desc(), PlanoDeAcao.id.desc()).limit(LIMITE_OPCOES)).unique())

    @staticmethod
    def motivo_inelegivel(u: Usuario, area_id: int) -> str | None:
        """Por que o usuário não pode entrar numa equipe da área (None = pode)."""
        if not u.ativo or u.convite_pendente:
            return f"{u.nome}: conta inativa ou com convite pendente."
        if not u.eh_administrador and "planos:ver" not in u.codigos_permissao:
            return f"{u.nome}: o perfil não permite visualizar planos."
        if not u.acessa_area(area_id):
            return f"{u.nome}: {MENSAGEM_SEM_ACESSO_AREA}"
        return None

    def candidatos(self, plano_id: int | None, equipe_id: int | None, q: str) -> list[Usuario]:
        """Usuários que podem entrar na equipe: busca por nome ou e-mail."""
        if plano_id is not None:
            area_id = self._plano_gerenciavel(plano_id).area_id
        elif equipe_id is not None:
            area_id = self._obter_gerenciavel(equipe_id).area_id
        else:
            raise RegraInvalida("Selecione o plano de ação antes dos participantes.")
        stmt = select(Usuario).where(Usuario.ativo.is_(True), Usuario.convite_pendente.is_(False))
        if termo := q.strip():
            stmt = stmt.where(or_(Usuario.nome.contains(termo, autoescape=True), Usuario.email.contains(termo, autoescape=True)))
        # A elegibilidade (perfil e áreas autorizadas) é verificada em Python; a busca limita o volume.
        usuarios = self.db.scalars(stmt.order_by(Usuario.nome).limit(300)).unique()
        return [u for u in usuarios if self.motivo_inelegivel(u, area_id) is None][:LIMITE_OPCOES]

    # ---- escrita --------------------------------------------------------------------------------

    def _registrar(self, equipe: Equipe, evento: str, descricao: str) -> None:
        self.db.add(EquipeHistorico(equipe_id=equipe.id, autor_id=self.usuario.id, evento=evento, descricao=descricao))

    def _validar_nome(self, nome: str, plano_id: int | None, area_id: int, equipe_id: int | None) -> None:
        """Sem repetir o nome no mesmo plano (sem diferenciar maiúsculas e espaços); sem plano: na mesma área."""
        stmt = select(Equipe.nome).where(func.lower(Equipe.nome) == nome.casefold())
        stmt = stmt.where(Equipe.plano_id == plano_id) if plano_id is not None else stmt.where(Equipe.plano_id.is_(None), Equipe.area_id == area_id)
        if equipe_id is not None:
            stmt = stmt.where(Equipe.id != equipe_id)
        if repetido := self.db.scalar(stmt.limit(1)):
            onde = "neste plano" if plano_id is not None else "nesta área (sem plano vinculado)"
            raise Conflito(f"Já existe a equipe “{repetido}” {onde}.")

    def _validar_composicao(
        self, d: DadosEquipe, area_id: int, atuais: set[int], coordenador_atual: int | None, revalidar_mantidos: bool
    ) -> dict[int, Usuario]:
        if len(set(d.participantes)) != len(d.participantes):
            raise RegraInvalida("O mesmo usuário foi incluído mais de uma vez na equipe.")
        if not d.participantes:
            raise RegraInvalida("Inclua pelo menos um participante.")
        if d.coordenador_id not in d.participantes:
            raise RegraInvalida("O coordenador da equipe precisa estar entre os participantes.")
        usuarios = {u.id: u for u in self.db.scalars(select(Usuario).where(Usuario.id.in_(d.participantes))).unique()}
        if faltando := [i for i in d.participantes if i not in usuarios]:
            raise RegraInvalida(f"Usuário(s) não encontrado(s): {', '.join(map(str, faltando))}.")
        # Novos participantes sempre; os que já estavam (vínculo histórico) só quando a equipe ganha um plano,
        # e então só as contas ativas — as inativas continuam como registro.
        verificar = [i for i in d.participantes if i not in atuais or (revalidar_mantidos and usuarios[i].ativo)]
        if d.coordenador_id != coordenador_atual and d.coordenador_id not in verificar:
            verificar.append(d.coordenador_id)
        motivos = [m for i in verificar if (m := self.motivo_inelegivel(usuarios[i], area_id))]
        if motivos:
            raise RegraInvalida(" ".join(motivos))
        return {i: usuarios[i] for i in d.participantes}

    def criar(self, d: DadosEquipe) -> Equipe:
        if d.plano_id is None:
            raise RegraInvalida("Selecione o plano de ação da equipe.")
        plano = self._plano_gerenciavel(d.plano_id)
        usuarios = self._validar_composicao(d, plano.area_id, set(), None, False)
        self._validar_nome(d.nome, plano.id, plano.area_id, None)
        equipe = Equipe(
            nome=d.nome, plano_id=plano.id, area_id=plano.area_id, coordenador_id=d.coordenador_id, descricao=d.descricao,
            ativo=d.ativo, criado_por_id=self.usuario.id,
        )
        self.db.add(equipe)
        self.db.flush()
        for uid in usuarios:
            self.db.add(EquipeMembro(equipe_id=equipe.id, usuario_id=uid, data_entrada=self.hoje))
        self._registrar(
            equipe, Evento.CRIACAO,
            f"Criou a equipe “{d.nome}” no plano {plano.codigo}, com {len(usuarios)} participante(s): "
            f"{_nomes(list(usuarios.values()))}. Coordenador: {usuarios[d.coordenador_id].nome}."
            + ("" if d.ativo else " Criada inativa."),
        )
        self.db.commit()
        self.db.refresh(equipe)
        return equipe

    def atualizar(self, equipe_id: int, d: DadosEquipe) -> Equipe:
        equipe = self._obter_gerenciavel(equipe_id)
        plano = equipe.plano
        vinculou = False
        if d.plano_id != equipe.plano_id:
            if equipe.plano_id is not None:
                raise RegraInvalida("O plano de uma equipe não pode ser trocado. Para outro plano, cadastre uma nova equipe.")
            plano, vinculou = self._plano_gerenciavel(d.plano_id), True
        area_id = plano.area_id if plano is not None else equipe.area_id
        membros = {m.usuario_id: m for m in equipe.membros}
        usuarios = self._validar_composicao(d, area_id, set(membros), equipe.coordenador_id, vinculou)
        self._validar_nome(d.nome, plano.id if plano is not None else None, area_id, equipe.id)

        if vinculou:
            equipe.plano_id = plano.id
            self._registrar(equipe, Evento.VINCULO_PLANO, f"Vinculou a equipe ao plano {plano.codigo} (regularização).")
        equipe.area_id = area_id

        mudancas = []
        if d.nome != equipe.nome:
            mudancas.append(f"nome “{equipe.nome}” → “{d.nome}”")
            equipe.nome = d.nome
        if d.descricao != equipe.descricao:
            mudancas.append("descrição/objetivo alterada")
            equipe.descricao = d.descricao
        if mudancas:
            self._registrar(equipe, Evento.EDICAO, "Editou a equipe: " + "; ".join(mudancas) + ".")

        incluidos = [usuarios[i] for i in d.participantes if i not in membros]
        removidos = [membros[i] for i in membros if i not in usuarios]
        for u in incluidos:
            self.db.add(EquipeMembro(equipe_id=equipe.id, usuario_id=u.id, data_entrada=self.hoje))
        for m in removidos:
            self.db.delete(m)
        partes = []
        if incluidos:
            partes.append(f"incluiu {_nomes(incluidos)}")
        if removidos:
            partes.append(f"removeu {_nomes([m.usuario for m in removidos])}")
        if partes:
            self._registrar(equipe, Evento.PARTICIPANTES, "Participantes: " + "; ".join(partes) + ".")

        if d.coordenador_id != equipe.coordenador_id:
            anterior = equipe.coordenador.nome if equipe.coordenador else "—"
            self._registrar(equipe, Evento.COORDENADOR, f"Coordenador: {anterior} → {usuarios[d.coordenador_id].nome}.")
            equipe.coordenador_id = d.coordenador_id
        self._mudar_situacao(equipe, d.ativo)
        self.db.commit()
        self.db.refresh(equipe)
        return equipe

    def _mudar_situacao(self, equipe: Equipe, ativo: bool) -> None:
        if ativo != equipe.ativo:
            equipe.ativo = ativo
            self._registrar(equipe, Evento.ATIVACAO if ativo else Evento.INATIVACAO, "Ativou a equipe." if ativo else "Inativou a equipe.")

    def alterar_situacao(self, equipe_id: int, ativo: bool) -> Equipe:
        equipe = self._obter_gerenciavel(equipe_id)
        self._mudar_situacao(equipe, ativo)
        self.db.commit()
        self.db.refresh(equipe)
        return equipe

    def excluir(self, equipe_id: int) -> None:
        """Exclusão lógica: a equipe some das consultas; participantes e histórico ficam no banco. Plano, ações,
        responsáveis e usuários não são tocados."""
        equipe = self._obter_gerenciavel(equipe_id)
        equipe.excluido_em, equipe.excluido_por_id = utcnow(), self.usuario.id
        plano = f" do plano {equipe.plano.codigo}" if equipe.plano is not None else " (sem plano vinculado)"
        self._registrar(equipe, Evento.EXCLUSAO, f"Excluiu a equipe “{equipe.nome}”{plano}. Plano, ações e responsáveis não foram alterados.")
        self.db.commit()

    # ---- desempenho ---------------------------------------------------------------------------

    def desempenho(self, equipe_id: int) -> dict:
        """Ações principais do plano da equipe atribuídas aos participantes atuais — nada de outros planos.
        Cada ação conta uma vez (tem um só responsável); nada é somado entre equipes."""
        equipe = self.obter(equipe_id)
        plano = equipe.plano
        if plano is None:
            return dict(disponivel=False, criterio="Equipe sem plano vinculado: vincule um plano para ver o desempenho.",
                        plano_arquivado=False, acoes_do_plano=0, geral=_resumo(None), participantes=[])
        membros = {m.usuario_id: m.usuario for m in self.participantes(equipe)}
        linhas = self.db.execute(
            select(Acao.responsavel_id, Acao.status, Acao.prazo, Acao.progresso, Acao.concluida_em).where(
                Acao.plano_id == plano.id, Acao.acao_pai_id.is_(None), Acao.arquivado_em.is_(None)
            )
        ).all()
        arquivado = plano.arquivado_em is not None
        da_equipe = [r for r in linhas if r.responsavel_id in membros]
        calcular = lambda rs: calcular_indicadores(((r.status, r.prazo, r.progresso, r.concluida_em) for r in rs), self.hoje)
        return dict(
            disponivel=True,
            criterio=(
                f"Ações principais do plano {plano.codigo} cujo responsável é participante atual da equipe "
                "(sem sub-itens, arquivadas, recusadas e canceladas). Cada ação conta uma vez, pelo responsável; "
                "ações de outros planos e de outras equipes não entram. % no prazo = concluídas até o prazo ÷ "
                "(concluídas + em atraso)."
            ),
            plano_arquivado=arquivado,
            acoes_do_plano=calcular(linhas).total,
            geral=_resumo(calcular(da_equipe), arquivado),
            participantes=[
                dict(usuario_id=uid, nome=u.nome, **_resumo(calcular([r for r in da_equipe if r.responsavel_id == uid]), arquivado))
                for uid, u in membros.items()
            ],
        )


def _resumo(i: IndicadoresAcoes | None, arquivado: bool = False) -> dict:
    if i is None:
        return dict(total=0, concluidas=0, concluidas_no_prazo=0, concluidas_com_atraso=0, em_aberto=0, em_atraso=0, percentual_no_prazo=None)
    # Plano arquivado: sem situação operacional de prazo (como nos indicadores do plano).
    return dict(
        total=i.total, concluidas=i.concluidas, concluidas_no_prazo=i.concluidas_no_prazo,
        concluidas_com_atraso=i.concluidas_com_atraso, em_aberto=i.pendentes + i.em_andamento,
        em_atraso=0 if arquivado else i.atrasadas, percentual_no_prazo=i.percentual_cumprimento,
    )
