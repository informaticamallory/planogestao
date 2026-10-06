import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.agendador import iniciar_agendador
from app.core.config import get_settings
from app.routers import (
    colaboradores,
    acoes,
    administracao,
    email_config,
    auth,
    calendario,
    dashboard,
    dispositivos,
    equipes,
    gamificacao,
    indicadores,
    itens,
    meu_perfil,
    minhas_acoes,
    notificacoes,
    planos,
    preferencias,
    relatorios,
    usuarios,
)
from app.services.canais import configurar_canais
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida

settings = get_settings()
configurar_canais()

# Logs da aplicação (job de alertas, canais de notificação) no console, junto com os do uvicorn.
_log = logging.getLogger("planogestao")
if not _log.handlers:
    _manipulador = logging.StreamHandler()
    _manipulador.setFormatter(logging.Formatter("%(levelname)s:     [%(name)s] %(message)s"))
    _log.addHandler(_manipulador)
    _log.setLevel(logging.INFO)


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    agendador = iniciar_agendador()
    yield
    if agendador:
        agendador.shutdown(wait=False)


app = FastAPI(title=settings.APP_NAME, version="0.1.0", lifespan=ciclo_de_vida)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Necessário para o navegador enviar o cookie httpOnly do refresh token.
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Type"],
    # Permite ao front ler o nome do arquivo nas exportações.
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(planos.router)
app.include_router(planos.opcoes_router)
app.include_router(planos.tipos_router)
# Antes de usuarios.router: "/usuarios/me" e "/usuarios/fotos/..." não podem cair em "/usuarios/{usuario_id}".
app.include_router(meu_perfil.router)
app.include_router(meu_perfil.fotos_router)
app.include_router(usuarios.router)
app.include_router(acoes.router)
app.include_router(notificacoes.router)
app.include_router(dispositivos.router)
app.include_router(gamificacao.router)
app.include_router(equipes.router)
app.include_router(minhas_acoes.router)
app.include_router(calendario.router)
app.include_router(indicadores.router)
app.include_router(itens.router)
app.include_router(relatorios.router)
app.include_router(preferencias.router)
app.include_router(email_config.router)
app.include_router(colaboradores.router)
for _r in (administracao.perfis_router, administracao.areas_router, administracao.setores_router,
           administracao.tipos_router, administracao.origens_router, administracao.configuracoes_router,
           administracao.envios_email_router):
    app.include_router(_r)


# Erros de domínio dos cadastros -> HTTP (mesmo formato {"detail": ...} do FastAPI).
_STATUS_ERRO = {NaoEncontrado: status.HTTP_404_NOT_FOUND, Conflito: status.HTTP_409_CONFLICT,
               RegraInvalida: status.HTTP_422_UNPROCESSABLE_ENTITY}


def _tratar_erro_dominio(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=_STATUS_ERRO[type(exc)], content={"detail": str(exc)})


for _erro in _STATUS_ERRO:
    app.add_exception_handler(_erro, _tratar_erro_dominio)


@app.get("/health", tags=["infra"])
def health() -> dict[str, str]:
    return {"status": "ok"}
