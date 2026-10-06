"""Cadastros de apoio: áreas, funções/cargos (tabela `setores`), tipos de plano, origens e Tipo ↔ Origem.

Exclusão só quando o registro não está em uso; se estiver, 409 e a orientação é inativar
(o histórico dos planos precisa continuar apontando para ele). Inativo some das opções de novos cadastros.
"""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Acao, Area, OrigemPlano, PlanoDeAcao, Setor, TipoPlano, Usuario
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida


def _contar(db: Session, coluna, valor: int) -> int:
    return db.scalar(select(func.count()).where(coluna == valor)) or 0


class CadastrosService:
    def __init__(self, db: Session):
        self.db = db

    def _obter(self, model, id_: int, rotulo: str):
        registro = self.db.get(model, id_)
        if registro is None:
            raise NaoEncontrado(f"{rotulo} não encontrado(a).")
        return registro

    def _commit(self, mensagem_duplicado: str) -> None:
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflito(mensagem_duplicado) from None

    def _excluir(self, registro, usos: dict[str, int], rotulo: str) -> None:
        em_uso = {k: v for k, v in usos.items() if v}
        if em_uso:
            detalhe = ", ".join(f"{v} {k}" for k, v in em_uso.items())
            raise Conflito(f"{rotulo} em uso ({detalhe}). Inative em vez de excluir.")
        self.db.delete(registro)
        self._commit(f"{rotulo} em uso. Inative em vez de excluir.")

    # ---- áreas -------------------------------------------------------------------------------

    def _usos_area(self, area_id: int) -> dict[str, int]:
        return {
            "usuário(s)": _contar(self.db, Usuario.area_id, area_id),
            "função(ões)/cargo(s)": _contar(self.db, Setor.area_id, area_id),
            "plano(s)": _contar(self.db, PlanoDeAcao.area_id, area_id),
        }

    def listar_areas(self) -> list[dict]:
        return [self._area(a) for a in self.db.scalars(select(Area).order_by(Area.nome))]

    def _area(self, a: Area) -> dict:
        usos = self._usos_area(a.id)
        return dict(id=a.id, nome=a.nome, ativo=a.ativo, usuarios=usos["usuário(s)"], setores=usos["função(ões)/cargo(s)"],
                    planos=usos["plano(s)"])

    def salvar_area(self, nome: str, ativo: bool, area_id: int | None = None) -> dict:
        area = self._obter(Area, area_id, "Área") if area_id else Area()
        area.nome, area.ativo = nome, ativo
        self.db.add(area)
        self._commit(f"Já existe uma área chamada “{nome}”.")
        return self._area(area)

    def excluir_area(self, area_id: int) -> None:
        self._excluir(self._obter(Area, area_id, "Área"), self._usos_area(area_id), "Área")

    # ---- funções/cargos (tabela `setores`, mesmos IDs e vínculos) --------------------------------

    def _usos_setor(self, setor_id: int) -> dict[str, int]:
        return {
            "usuário(s)": _contar(self.db, Usuario.setor_id, setor_id),
            "plano(s)": _contar(self.db, PlanoDeAcao.setor_id, setor_id),
            # Ações também apontam para a função/cargo: em uso, não pode ser excluída.
            "ação(ões)": _contar(self.db, Acao.setor_id, setor_id),
        }

    def _setor(self, s: Setor) -> dict:
        usos = self._usos_setor(s.id)
        return dict(id=s.id, nome=s.nome, ativo=s.ativo, area_id=s.area_id, area=s.area.nome,
                    usuarios=usos["usuário(s)"], planos=usos["plano(s)"])

    def listar_setores(self, area_id: int | None = None) -> list[dict]:
        consulta = select(Setor).join(Area).order_by(Area.nome, Setor.nome)
        if area_id is not None:
            consulta = consulta.where(Setor.area_id == area_id)
        return [self._setor(s) for s in self.db.scalars(consulta)]

    def salvar_setor(self, nome: str, area_id: int, ativo: bool, setor_id: int | None = None) -> dict:
        area = self._obter(Area, area_id, "Área")
        setor = self._obter(Setor, setor_id, "Função/cargo") if setor_id else Setor()
        if setor_id and setor.area_id != area_id and any(self._usos_setor(setor_id).values()):
            # Mover uma função/cargo em uso deixaria usuários/planos com área e função/cargo inconsistentes.
            raise RegraInvalida("Função/cargo em uso não pode mudar de área. Cadastre uma nova função/cargo na outra área.")
        if not setor_id and not area.ativo:
            raise RegraInvalida("Não é possível cadastrar função/cargo em área inativa.")
        nome = nome.strip()
        # Mesmo nome na mesma área, sem diferenciar maiúsculas/minúsculas e espaços nas pontas (em outra área, pode).
        chave = nome.casefold()
        repetido = next(
            (s for s in self.db.scalars(select(Setor).where(Setor.area_id == area_id, Setor.id != (setor_id or 0)))
             if s.nome.strip().casefold() == chave),
            None,
        )
        if repetido is not None:
            raise Conflito(f"Já existe a função/cargo “{repetido.nome}” na área {area.nome}.")
        setor.nome, setor.area_id, setor.ativo = nome, area_id, ativo
        self.db.add(setor)
        self._commit(f"Já existe a função/cargo “{nome}” nesta área.")
        self.db.refresh(setor)
        return self._setor(setor)

    def excluir_setor(self, setor_id: int) -> None:
        self._excluir(self._obter(Setor, setor_id, "Função/cargo"), self._usos_setor(setor_id), "Função/cargo")

    def funcoes_por_area(self) -> list[dict]:
        """Uma linha por área (inclusive sem funções/cargos), com totais SEM repetir usuário ou plano."""
        areas = list(self.db.scalars(select(Area).order_by(Area.nome)))
        n_funcoes = dict(self.db.execute(select(Setor.area_id, func.count(Setor.id)).group_by(Setor.area_id)).all())
        usuarios = dict(self.db.execute(
            select(Setor.area_id, func.count(func.distinct(Usuario.id))).join(Usuario, Usuario.setor_id == Setor.id).group_by(Setor.area_id)
        ).all())
        planos = dict(self.db.execute(
            select(Setor.area_id, func.count(func.distinct(PlanoDeAcao.id)))
            .join(PlanoDeAcao, PlanoDeAcao.setor_id == Setor.id).group_by(Setor.area_id)
        ).all())
        return [
            dict(id=a.id, nome=a.nome, ativo=a.ativo, funcoes=n_funcoes.get(a.id, 0), usuarios=usuarios.get(a.id, 0),
                 planos=planos.get(a.id, 0))
            for a in areas
        ]

    # ---- tipos de plano ----------------------------------------------------------------------

    def _tipo(self, t: TipoPlano) -> dict:
        return dict(
            id=t.id,
            nome=t.nome,
            ativo=t.ativo,
            planos=_contar(self.db, PlanoDeAcao.tipo_id, t.id),
            origens=[dict(id=o.id, nome=o.nome) for o in t.origens],
        )

    def listar_tipos(self) -> list[dict]:
        return [self._tipo(t) for t in self.db.scalars(select(TipoPlano).order_by(TipoPlano.nome))]

    def salvar_tipo(self, nome: str, ativo: bool, tipo_id: int | None = None) -> dict:
        tipo = self._obter(TipoPlano, tipo_id, "Tipo de plano") if tipo_id else TipoPlano()
        tipo.nome, tipo.ativo = nome, ativo
        self.db.add(tipo)
        self._commit(f"Já existe um tipo de plano chamado “{nome}”.")
        return self._tipo(tipo)

    def excluir_tipo(self, tipo_id: int) -> None:
        self._excluir(
            self._obter(TipoPlano, tipo_id, "Tipo de plano"),
            {"plano(s)": _contar(self.db, PlanoDeAcao.tipo_id, tipo_id)},
            "Tipo de plano",
        )

    def definir_origens_do_tipo(self, tipo_id: int, origem_ids: list[int]) -> dict:
        """Substitui as origens compatíveis com o tipo (multi-seleção). Não altera planos já cadastrados."""
        tipo = self._obter(TipoPlano, tipo_id, "Tipo de plano")
        ids = sorted(set(origem_ids))
        origens = list(self.db.scalars(select(OrigemPlano).where(OrigemPlano.id.in_(ids)))) if ids else []
        faltando = set(ids) - {o.id for o in origens}
        if faltando:
            raise RegraInvalida(f"Origem(ns) inexistente(s): {', '.join(map(str, sorted(faltando)))}.")
        tipo.origens = origens
        self.db.commit()
        self.db.refresh(tipo)
        return self._tipo(tipo)

    # ---- origens -----------------------------------------------------------------------------

    def _origem(self, o: OrigemPlano) -> dict:
        tipos = self.db.scalars(select(TipoPlano).where(TipoPlano.origens.contains(o)).order_by(TipoPlano.nome))
        return dict(
            id=o.id,
            nome=o.nome,
            ativo=o.ativo,
            planos=_contar(self.db, PlanoDeAcao.origem_id, o.id),
            tipos=[dict(id=t.id, nome=t.nome) for t in tipos],
        )

    def listar_origens(self) -> list[dict]:
        return [self._origem(o) for o in self.db.scalars(select(OrigemPlano).order_by(OrigemPlano.nome))]

    def salvar_origem(self, nome: str, ativo: bool, origem_id: int | None = None) -> dict:
        origem = self._obter(OrigemPlano, origem_id, "Origem") if origem_id else OrigemPlano()
        origem.nome, origem.ativo = nome, ativo
        self.db.add(origem)
        self._commit(f"Já existe uma origem chamada “{nome}”.")
        return self._origem(origem)

    def excluir_origem(self, origem_id: int) -> None:
        """Em uso por planos → 409 (inative). A compatibilidade com os tipos sai junto (cascade)."""
        self._excluir(
            self._obter(OrigemPlano, origem_id, "Origem"),
            {"plano(s)": _contar(self.db, PlanoDeAcao.origem_id, origem_id)},
            "Origem",
        )
