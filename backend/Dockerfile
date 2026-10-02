# API PlanoGestão (FastAPI). Build a partir da pasta backend/ (no Easypanel: Build Path = /backend).
# Configuração só por variáveis de ambiente (ver .env.example): nada de .env dentro da imagem.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

# Dependências antes do código: o cache do Docker reaproveita esta camada quando só o código muda.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Pastas de dados (anexos e .eml do modo arquivo). Monte um volume em /app/uploads para os anexos
# sobreviverem às novas implantações. Roda como root para conseguir gravar no volume montado pelo painel.
RUN mkdir -p uploads emails

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/health', timeout=4)"

# Aplica as migrações pendentes e sobe a API escutando em todas as interfaces (0.0.0.0).
# Um processo só: o agendador (alertas de prazo e fila de e-mails) roda dentro da API.
# --proxy-headers: a API fica atrás do proxy do painel (HTTPS terminado nele).
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
