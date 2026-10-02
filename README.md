# PlanoGestão

Gestão de Planos de Ação (5W2H / PDCA). Monorepo com API única para web e mobile.

```
backend/                 API FastAPI + SQLAlchemy + Alembic (MySQL)
packages/shared-types/   Tipos TS gerados do OpenAPI da API (openapi-typescript)
packages/api-client/     Cliente HTTP tipado (openapi-fetch), usado por web e mobile
apps/web/                React + Vite
docs/prototipo/          Protótipo HTML de referência
```

## Pré-requisitos

Python 3.11+, Node 20+, pnpm 9 e MySQL 8+ (InnoDB).

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # preencha DB_* e JWT_SECRET
alembic upgrade head
python -m app.seed                # usuários, planos, ações e histórico de dev (senha: Senha@123)
                                  # --reset recria planos/ações com datas relativas a hoje
uvicorn app.main:app --reload --reload-dir app --port 8000
```

Documentação interativa: http://localhost:8000/docs

## Web

```bash
pnpm install
pnpm dev:web                      # http://localhost:5173
```

Sempre que um schema da API mudar (com a API rodando): `pnpm gen:types`.

## Autenticação

- `POST /auth/login` retorna o access token (JWT, 15 min) e os dados do usuário com perfil e permissões.
- **Web**: o refresh token vai apenas em cookie `httpOnly` (path `/auth`). O access token fica só em
  memória; ao recarregar a página a sessão é restaurada via `POST /auth/refresh`.
- **Mobile**: envia `X-Client-Type: mobile` e recebe o refresh token no corpo, para guardar no SecureStore.
- O refresh token é rotacionado a cada uso e gravado no banco apenas como hash SHA-256.
- Autorização nas rotas: `Depends(require_role([...]))` ou `Depends(require_permission("codigo"))`
  (ver `backend/app/core/deps.py`).
