"""Erros de domínio dos cadastros. Convertidos em HTTP por handlers registrados em main.py."""


class NaoEncontrado(Exception):
    """404"""


class Proibido(Exception):
    """403: o perfil ou o papel do usuário não permite a operação."""


class Conflito(Exception):
    """409: duplicidade ou registro em uso."""


class RegraInvalida(Exception):
    """422: dado válido no formato, mas proibido pela regra de negócio."""
