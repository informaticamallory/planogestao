"""Equipes: cadastro, membros e indicadores.

Indicadores e desempenho não têm cálculo próprio: usam o IndicadoresService (Fase 9) com
`responsaveis` = membros da equipe.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Area, Equipe, EquipeMembro, Setor, Usuario
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida
from app.services.indicadores_service import FiltrosIndicadores, IndicadoresService
from app.services.periodo import Periodo


@dataclass(frozen=True)
class DadosEquipe:
    nome: str
    area_id: int
    setor_id: int | None
    supervisor_id: int
    descricao: str | None
    ativo: bool


class EquipesService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje

    # ---- leitura ------------------------------------------------------------------------------

    def obter(self, equipe_id: int) -> Equipe:
        equipe = self.db.get(Equipe, equipe_id)
        if equipe is None:
            raise NaoEncontrado("Equipe não encontrada.")
        return equipe

    def membros_ids(self, equipe_id: int) -> frozenset[int]:
        return frozenset(self.db.scalars(select(EquipeMembro.usuario_id).where(EquipeMembro.equipe_id == equipe_id)))

    def contagem_membros(self, ids: list[int]) -> dict[int, int]:
        if not ids:
            return {}
        return dict(
            self.db.execute(
                select(EquipeMembro.equipe_id, func.count()).where(EquipeMembro.equipe_id.in_(ids)).group_by(EquipeMembro.equipe_id)
            ).all()
        )

    def listar(self, q: str, area_id: int | None, ativo: bool | None, page: int, page_size: int) -> tuple[list[Equipe], int]:
        stmt = select(Equipe)
        termo = q.strip()
        if termo:
            stmt = stmt.join(Usuario, Equipe.supervisor_id == Usuario.id).where(
                or_(Equipe.nome.contains(termo, autoescape=True), Usuario.nome.contains(termo, autoescape=True))
            )
        if area_id is not None:
            stmt = stmt.where(Equipe.area_id == area_id)
        if ativo is not None:
            stmt = stmt.where(Equipe.ativo.is_(ativo))
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        itens = list(self.db.scalars(stmt.order_by(Equipe.ativo.desc(), Equipe.nome).offset((page - 1) * page_size).limit(page_size)).unique())
        return itens, total

    def membros(self, equipe_id: int) -> list[EquipeMembro]:
        self.obter(equipe_id)
        return list(
            self.db.scalars(
                select(EquipeMembro)
                .join(Usuario, EquipeMembro.usuario_id == Usuario.id)
                .where(EquipeMembro.equipe_id == equipe_id)
                .order_by(Usuario.nome)
            ).unique()
        )

    # ---- indicadores (reaproveitam o IndicadoresService) ------------------------------------

    def _filtros(self, equipe_id: int, periodo: Periodo) -> FiltrosIndicadores:
        return FiltrosIndicadores(periodo=periodo, responsaveis=self.membros_ids(equipe_id))

    def desempenho(self, equipe_id: int, periodo: Periodo) -> float | None:
        """% de ações no prazo — o mesmo número de "% ações no prazo" da aba Indicadores."""
        svc = IndicadoresService(self.db, self.usuario, self.hoje)
        return svc.cumprimento_prazo(self._filtros(equipe_id, periodo))["percentual_no_prazo"]

    def indicadores(self, equipe_id: int, periodo: Periodo, limite_pendencias: int = 10) -> dict:
        self.obter(equipe_id)
        f = self._filtros(equipe_id, periodo)
        svc = IndicadoresService(self.db, self.usuario, self.hoje)
        return {
            "membros": len(f.responsaveis or ()),
            "gerais": svc.gerais(f),
            "planos_por_status": svc.planos_por_status(f),
            "planos_por_prazo": svc.planos_por_prazo(f),
            "acoes_por_status": svc.acoes_por_status(f),
            "cumprimento_prazo": svc.cumprimento_prazo(f),
            "evolucao_mensal": svc.evolucao_mensal(f),
            "responsaveis_com_pendencias": svc.responsaveis_com_pendencias(f, limite_pendencias),
        }

    # ---- escrita --------------------------------------------------------------------------------

    def _validar(self, d: DadosEquipe, equipe_id: int | None) -> None:
        area = self.db.get(Area, d.area_id)
        if area is None:
            raise RegraInvalida("Área não encontrada.")
        if d.setor_id is not None:
            setor = self.db.get(Setor, d.setor_id)
            if setor is None or setor.area_id != d.area_id:
                raise RegraInvalida("O setor escolhido não pertence à área da equipe.")
        supervisor = self.db.get(Usuario, d.supervisor_id)
        if supervisor is None or not supervisor.ativo:
            raise RegraInvalida("Escolha um supervisor ativo.")
        duplicada = select(Equipe.id).where(Equipe.area_id == d.area_id, Equipe.nome == d.nome)
        if equipe_id is not None:
            duplicada = duplicada.where(Equipe.id != equipe_id)
        if self.db.scalar(duplicada):
            raise Conflito(f"Já existe uma equipe “{d.nome}” nesta área.")

    def criar(self, d: DadosEquipe) -> Equipe:
        self._validar(d, None)
        equipe = Equipe(**d.__dict__)
        self.db.add(equipe)
        self.db.commit()
        self.db.refresh(equipe)
        return equipe

    def atualizar(self, equipe_id: int, d: DadosEquipe) -> Equipe:
        equipe = self.obter(equipe_id)
        self._validar(d, equipe_id)
        for campo, valor in d.__dict__.items():
            setattr(equipe, campo, valor)
        self.db.commit()
        self.db.refresh(equipe)
        return equipe

    def excluir(self, equipe_id: int) -> None:
        """Equipe não tem histórico ligado a ela (planos e pontos são das pessoas): exclusão definitiva."""
        self.db.delete(self.obter(equipe_id))
        self.db.commit()

    def adicionar_membros(self, equipe_id: int, usuario_ids: list[int], papel: str | None) -> dict:
        self.obter(equipe_id)
        pedidos = list(dict.fromkeys(usuario_ids))
        usuarios = {u.id: u for u in self.db.scalars(select(Usuario).where(Usuario.id.in_(pedidos)))}
        inexistentes = [i for i in pedidos if i not in usuarios]
        if inexistentes:
            raise RegraInvalida(f"Usuário(s) não encontrado(s): {', '.join(map(str, inexistentes))}.")
        inativos = [usuarios[i].nome for i in pedidos if not usuarios[i].ativo]
        if inativos:
            raise RegraInvalida(f"Usuário(s) inativo(s) não podem entrar na equipe: {', '.join(inativos)}.")

        atuais = self.membros_ids(equipe_id)
        adicionados = [i for i in pedidos if i not in atuais]
        for uid in adicionados:
            self.db.add(EquipeMembro(equipe_id=equipe_id, usuario_id=uid, papel_na_equipe=papel, data_entrada=self.hoje))
        self.db.commit()
        return {"adicionados": adicionados, "ja_membros": [i for i in pedidos if i in atuais]}

    def atualizar_membro(self, equipe_id: int, usuario_id: int, papel: str | None) -> EquipeMembro:
        membro = self.db.get(EquipeMembro, (equipe_id, usuario_id))
        if membro is None:
            raise NaoEncontrado("Este usuário não é membro da equipe.")
        membro.papel_na_equipe = papel
        self.db.commit()
        self.db.refresh(membro)
        return membro

    def remover_membro(self, equipe_id: int, usuario_id: int) -> None:
        membro = self.db.get(EquipeMembro, (equipe_id, usuario_id))
        if membro is None:
            raise NaoEncontrado("Este usuário não é membro da equipe.")
        self.db.delete(membro)
        self.db.commit()
