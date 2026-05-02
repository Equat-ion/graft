# Backend image: FastAPI + LangGraph agent + watcher.
# vLLM is launched as a child process at startup; this image expects GPU passthrough
# at runtime (NVIDIA Container Toolkit). For CPU-only local dev, use the python
# entrypoint directly without docker-compose's GPU reservation.
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# Docker CLI for sandbox runs (we mount the host docker socket).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential git curl ca-certificates docker.io \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip \
 && pip install -e . \
 && pip install "uvicorn[standard]>=0.32.0"

COPY . .

EXPOSE 8000 8001

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
