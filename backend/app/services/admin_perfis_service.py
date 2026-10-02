"""Perfis e matriz de permissões.

- O perfil Administrador é fixo: não pode ser renomeado, excluído nem ter a matriz alterada
  (tem sempre todas as permissões). O acesso à Administração depende dele, não de checkbox.
- Permissões do módulo Administração não podem ser concedidas a outros perfis.
- Mudança de permissões vale na próxima requisição de cada usuário (lidas a cada request);
  o menu do front atualiza no próximo login/refresh de sessão.
"""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissoes import ACOES_MATRIZ, CODIGOS_ATRIBUIVEIS, MODULO_ADMINISTRACAO, MODULOS, PERFIL_ADMINISTRADOR
from app.models import Perfil, Permissao, Usuario
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida


class PerfisService:
    def __init__(self, db: Session):
        self.db = db

    def _obter(self, perfil_id: int) -> Perfil:
        perfil = self.db.get(Perfil, perfil_id)
        if perfil is None:
            raise NaoEncontrado("Perfil não encontrado.")
        return perfil

    def _dto(self, perfil: Perfil) -> dict:
        usuarios = self.db.scalar(select(func.count(Usuario.id)).where(Usuario.perfil_id == perfil.id)) or 0
        return dict(
            id=perfil.id,
            nome=perfil.nome,
            descricao=perfil.descricao,
            usuarios=usuarios,
            permissoes=sorted(p.codigo for p in perfil.permissoes),
            editavel=perfil.nome != PERFIL_ADMINISTRADOR,
        )

    def listar(self) -> list[dict]:
        return [self._dto(p) for p in self.db.scalars(select(Perfil).order_by(Perfil.nome))]

    def detalhe(self, perfil_id: int) -> dict:
        return self._dto(self._obter(perfil_id))

    def catalogo(self) -> dict:
        """Linhas (módulos) e colunas (ações) da matriz, com as permissões que existem em cada célula."""
        permissoes = self.db.scalars(select(Permissao).where(Permissao.modulo != MODULO_ADMINISTRACAO).order_by(Permissao.codigo))
        return dict(
            modulos=[{"id": m, "nome": n} for m, n in MODULOS if m != MODULO_ADMINISTRACAO],
            acoes=[{"id": a, "nome": n} for a, n in ACOES_MATRIZ],
            permissoes=[{"codigo": p.codigo, "modulo": p.modulo, "acao": p.acao, "descricao": p.descricao} for p in permissoes],
        )

    def _permissoes(self, codigos: list[str]) -> list[Permissao]:
        pedidos = set(codigos)
        proibidos = pedidos - CODIGOS_ATRIBUIVEIS
        if proibidos:
            raise RegraInvalida(
                f"Permissões inválidas ou exclusivas do Administrador: {', '.join(sorted(proibidos))}."
            )
        return list(self.db.scalars(select(Permissao).where(Permissao.codigo.in_(pedidos)))) if pedidos else []

    def _commit(self, nome: str) -> None:
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflito(f"Já existe um perfil chamado “{nome}”.") from None

    def criar(self, nome: str, descricao: str | None, codigos: list[str]) -> dict:
        if nome.casefold() == PERFIL_ADMINISTRADOR.casefold():
            raise Conflito(f"Já existe um perfil chamado “{nome}”.")
        perfil = Perfil(nome=nome, descricao=descricao, permissoes=self._permissoes(codigos))
        self.db.add(perfil)
        self._commit(nome)
        return self._dto(perfil)

    def atualizar(self, perfil_id: int, nome: str, descricao: str | None, codigos: list[str]) -> dict:
        perfil = self._obter(perfil_id)
        if perfil.nome == PERFIL_ADMINISTRADOR:
            raise RegraInvalida("O perfil Administrador é fixo: tem sempre acesso total e não pode ser alterado.")
        if nome.casefold() == PERFIL_ADMINISTRADOR.casefold():
            raise Conflito(f"Já existe um perfil chamado “{nome}”.")
        perfil.nome, perfil.descricao = nome, descricao
        perfil.permissoes = self._permissoes(codigos)
        self._commit(nome)
        return self._dto(perfil)

    def excluir(self, perfil_id: int) -> None:
        perfil = self._obter(perfil_id)
        if perfil.nome == PERFIL_ADMINISTRADOR:
            raise RegraInvalida("O perfil Administrador não pode ser excluído.")
        usuarios = self.db.scalar(select(func.count(Usuario.id)).where(Usuario.perfil_id == perfil.id)) or 0
        if usuarios:
            raise Conflito(f"Perfil em uso por {usuarios} usuário(s). Mude o perfil deles antes de excluir.")
        self.db.delete(perfil)
        self.db.commit()
