"""Catálogo de permissões: fonte única para seed, migration e matriz de perfis.

Só entra aqui o que o backend de fato verifica. Uma célula da matriz sem permissão
correspondente (ex.: "excluir planos", que não existe — planos são arquivados) fica desabilitada.
"""

from dataclasses import dataclass

# Nome do perfil com acesso ao módulo Administração. Verificado pelo nome (require_admin),
# não por checkbox: a matriz não consegue conceder nem retirar administração.
PERFIL_ADMINISTRADOR = "Administrador"
MODULO_ADMINISTRACAO = "administracao"

ACOES_MATRIZ: list[tuple[str, str]] = [
    ("visualizar", "Visualizar"),
    ("criar", "Criar"),
    ("editar", "Editar"),
    ("excluir", "Excluir"),
    ("aprovar", "Aprovar"),
    ("outra", "Outras"),
]

MODULOS: list[tuple[str, str]] = [
    ("dashboard", "Dashboard"),
    ("planos", "Planos de ação"),
    ("acoes", "Ações"),
    ("equipes", "Equipes"),
    ("calendario", "Calendário"),
    ("indicadores", "Indicadores"),
    ("relatorios", "Relatórios"),
    ("notificacoes", "Notificações"),
    ("gamificacao", "Gamificação"),
    ("cadastros", "Cadastros (áreas, setores, tipos e origens)"),
    (MODULO_ADMINISTRACAO, "Administração"),
]


@dataclass(frozen=True)
class DefPermissao:
    codigo: str
    modulo: str
    acao: str
    descricao: str


PERMISSOES: list[DefPermissao] = [
    DefPermissao("dashboard:ver", "dashboard", "visualizar", "Visualizar o dashboard"),
    DefPermissao("planos:ver", "planos", "visualizar", "Visualizar planos de ação (da própria área e em que participa)"),
    DefPermissao("planos:ver_todos", "planos", "outra", "Visualizar planos de todas as áreas"),
    DefPermissao("planos:criar", "planos", "criar", "Criar planos de ação"),
    DefPermissao("planos:editar", "planos", "editar", "Editar e arquivar planos de qualquer autor"),
    DefPermissao("acoes:ver_proprias", "acoes", "visualizar", "Minhas Ações: ver e atualizar as próprias ações"),
    DefPermissao("acoes:aprovar_prazo", "acoes", "aprovar", "Responder solicitações de alteração de prazo"),
    DefPermissao("equipes:ver", "equipes", "visualizar", "Visualizar equipes"),
    DefPermissao("equipes:gerenciar", "equipes", "editar", "Criar, editar e excluir equipes e seus membros"),
    DefPermissao("calendario:ver", "calendario", "visualizar", "Visualizar calendário"),
    DefPermissao("indicadores:ver", "indicadores", "visualizar", "Visualizar indicadores"),
    DefPermissao("relatorios:ver", "relatorios", "visualizar", "Visualizar e exportar relatórios"),
    DefPermissao("notificacoes:ver", "notificacoes", "visualizar", "Visualizar notificações"),
    DefPermissao("gamificacao:ver", "gamificacao", "visualizar", "Visualizar gamificação e eficiência"),
    # Atribuível (Administrador e Gestor por padrão): cadastros usados nos planos.
    DefPermissao("cadastros:gerenciar", "cadastros", "editar", "Gerenciar áreas, setores, tipos de plano e origens"),
    # Exclusivas do Administrador (usadas pelo front para exibir o menu).
    DefPermissao("admin:usuarios", MODULO_ADMINISTRACAO, "outra", "Gerenciar usuários"),
    DefPermissao("admin:perfis", MODULO_ADMINISTRACAO, "outra", "Gerenciar perfis e permissões"),
    DefPermissao("admin:configuracoes", MODULO_ADMINISTRACAO, "outra", "Gerenciar configurações"),
]

CODIGOS_CATALOGO = frozenset(p.codigo for p in PERMISSOES)
CODIGOS_ADMIN = frozenset(p.codigo for p in PERMISSOES if p.modulo == MODULO_ADMINISTRACAO)
CODIGOS_ATRIBUIVEIS = frozenset(p.codigo for p in PERMISSOES if p.modulo != MODULO_ADMINISTRACAO)
