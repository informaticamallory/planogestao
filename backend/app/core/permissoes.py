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
    ("cadastros", "Cadastros (áreas, funções/cargos, tipos e origens)"),
    ("colaboradores", "Colaboradores (convites de primeiro acesso)"),
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
    # Vê todos os planos das ÁREAS AUTORIZADAS do usuário (cadastro do usuário), não de todas as áreas.
    DefPermissao("planos:ver_todos", "planos", "outra", "Visualizar planos das áreas autorizadas"),
    DefPermissao("planos:criar", "planos", "criar", "Criar planos de ação"),
    DefPermissao("planos:editar", "planos", "editar", "Editar e arquivar planos de qualquer autor"),
    # Exclusão lógica (some das consultas; o histórico fica). Exige também poder editar o plano.
    DefPermissao("planos:excluir", "planos", "excluir", "Excluir planos (com suas ações e sub-itens)"),
    DefPermissao("acoes:ver_proprias", "acoes", "visualizar", "Minhas Ações: ver e atualizar as próprias ações"),
    DefPermissao("acoes:aprovar_prazo", "acoes", "aprovar", "Responder solicitações de alteração de prazo"),
    # Exigem também ser gestor do plano/item (responsável, criador, quem aprova prazos ou "Editar planos").
    DefPermissao("acoes:arquivar", "acoes", "outra", "Arquivar e desarquivar ações e sub-itens"),
    DefPermissao("acoes:excluir", "acoes", "excluir", "Excluir ações e sub-itens"),
    # Equipes são de um plano. Ver: as equipes das quais participa (com acesso ao plano) ou que gerencia.
    # Gerenciar: equipes dos planos que o usuário gerencia (responsável, autor ou "Editar planos"), nas áreas autorizadas.
    DefPermissao("equipes:ver", "equipes", "visualizar", "Visualizar equipes (das quais participa ou que gerencia)"),
    DefPermissao("equipes:gerenciar", "equipes", "editar", "Criar, editar e excluir equipes dos planos que gerencia"),
    DefPermissao("calendario:ver", "calendario", "visualizar", "Visualizar calendário"),
    DefPermissao("indicadores:ver", "indicadores", "visualizar", "Visualizar indicadores"),
    DefPermissao("relatorios:ver", "relatorios", "visualizar", "Visualizar e exportar relatórios"),
    DefPermissao("notificacoes:ver", "notificacoes", "visualizar", "Visualizar notificações"),
    DefPermissao("gamificacao:ver", "gamificacao", "visualizar", "Visualizar gamificação e eficiência"),
    # Apuração por período: nenhum perfil além do Administrador recebe automaticamente.
    DefPermissao("gamificacao:auditoria", "gamificacao", "visualizar", "Consultar a auditoria da pontuação"),
    DefPermissao("gamificacao:exportar", "gamificacao", "outra", "Exportar a auditoria da pontuação"),
    DefPermissao("gamificacao:periodos", "gamificacao", "editar", "Gerenciar períodos, prêmios, regularizações e correções da pontuação"),
    DefPermissao("gamificacao:encerrar", "gamificacao", "aprovar", "Encerrar a apuração de um período"),
    DefPermissao("gamificacao:reabrir", "gamificacao", "outra", "Reabrir a apuração de um período encerrado"),
    # Atribuível (Administrador e Gestor por padrão): cadastros usados nos planos.
    DefPermissao("colaboradores:convidar", "colaboradores", "criar", "Convidar colaboradores (perfil Colaborador, nas próprias áreas)"),
    DefPermissao("cadastros:gerenciar", "cadastros", "editar", "Gerenciar áreas, funções/cargos, tipos de plano e origens"),
    # Exclusivas do Administrador (usadas pelo front para exibir o menu).
    DefPermissao("admin:usuarios", MODULO_ADMINISTRACAO, "outra", "Gerenciar usuários"),
    DefPermissao("admin:perfis", MODULO_ADMINISTRACAO, "outra", "Gerenciar perfis e permissões"),
    DefPermissao("admin:configuracoes", MODULO_ADMINISTRACAO, "outra", "Gerenciar configurações"),
]

CODIGOS_CATALOGO = frozenset(p.codigo for p in PERMISSOES)
CODIGOS_ADMIN = frozenset(p.codigo for p in PERMISSOES if p.modulo == MODULO_ADMINISTRACAO)
CODIGOS_ATRIBUIVEIS = frozenset(p.codigo for p in PERMISSOES if p.modulo != MODULO_ADMINISTRACAO)
