# ─── Backend: FastAPI + MCP server (Railway-ready) ─────────────────────────
FROM python:3.11-slim AS base

# Avoid prompts and speed up pip
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system deps needed by pymysql + cryptography + bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies layer
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy source
COPY . .

# Railway / Fly.io / Render inject $PORT — fallback to 8000 for local docker run
EXPOSE 8000

# Exec form + explicit sh -c so $PORT (set by Railway / Render / Fly.io) expands
# and PID 1 forwards SIGTERM correctly on graceful shutdown.
CMD ["/bin/sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
