from pydantic import BaseModel


class Pagina[T](BaseModel):
    """Resposta paginada padrão de todas as listagens."""

    items: list[T]
    total: int
    page: int
    page_size: int


class Opcao(BaseModel):
    id: int
    nome: str
