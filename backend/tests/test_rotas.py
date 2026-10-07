"""Regressão de roteamento: rotas fixas (ex.: /equipes/arvore) não podem ser capturadas por rotas dinâmicas
registradas antes (ex.: /equipes/{equipe_id}, que responderia 422 "arvore não é inteiro").

Não usa banco: resolve o caminho como o Starlette faz (primeira rota que casa, na ordem de registro).
    cd backend && python -m tests.test_rotas      (ou: pytest tests/test_rotas.py)
"""

import os

# Valores fictícios só para importar a aplicação (nada conecta ao banco aqui).
for chave, valor in {"ENVIRONMENT": "development", "DB_HOST": "127.0.0.1", "DB_USER": "teste", "DB_NAME": "teste",
                     "JWT_SECRET": "teste-de-rotas-0123456789-0123456789", "EMAIL_HABILITADO": "false",
                     "PUSH_HABILITADO": "false"}.items():
    os.environ.setdefault(chave, valor)

from starlette.routing import Match, Route  # noqa: E402

from app.main import app  # noqa: E402


def _primeira(metodo: str, caminho: str):
    escopo = {"type": "http", "method": metodo, "path": caminho, "root_path": ""}
    for rota in app.router.routes:
        casou, _ = rota.matches(escopo)
        if casou == Match.FULL:
            return rota
    return None


def test_arvore_chega_ao_endpoint_da_arvore():
    rota = _primeira("GET", "/equipes/arvore")
    assert rota is not None and rota.path == "/equipes/arvore" and rota.endpoint.__name__ == "arvore", rota and rota.path


def test_detalhe_da_equipe_continua_dinamico():
    rota = _primeira("GET", "/equipes/123")
    assert rota is not None and rota.path == "/equipes/{equipe_id}" and rota.endpoint.__name__ == "detalhe"
    # "arvore" e "opcoes" nunca chegam ao detalhe; um texto qualquer continua indo para lá (e a validação de
    # inteiro responde 422, como antes).
    assert _primeira("GET", "/equipes/qualquer").path == "/equipes/{equipe_id}"
    assert _primeira("GET", "/equipes/opcoes/planos").path == "/equipes/opcoes/planos"


def test_nenhuma_rota_fixa_fica_atras_de_uma_dinamica():
    """Para todo o app: se uma rota dinâmica casa com o caminho de uma rota fixa do mesmo método, a fixa tem de
    vir antes. Pega o mesmo erro em qualquer módulo."""
    rotas = [r for r in app.router.routes if isinstance(r, Route)]
    problemas = []
    for i, dinamica in enumerate(rotas):
        if "{" not in dinamica.path:
            continue
        for fixa in rotas[i + 1:]:
            if "{" in fixa.path or not (dinamica.methods & fixa.methods):
                continue
            if dinamica.path_regex.match(fixa.path):
                problemas.append(f"{sorted(fixa.methods & dinamica.methods)} {fixa.path} está depois de {dinamica.path}")
    assert not problemas, "\n".join(problemas)


if __name__ == "__main__":
    falhas = 0
    for nome, teste in list(globals().items()):
        if nome.startswith("test_") and callable(teste):
            try:
                teste()
                print(f"  OK {nome}")
            except AssertionError as erro:
                falhas += 1
                print(f"  FALHOU {nome}: {erro}")
    print(f"{falhas} falha(s)")
    raise SystemExit(1 if falhas else 0)
