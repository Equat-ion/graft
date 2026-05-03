# Combined image: FastAPI + LangGraph agent + watcher + vLLM.
# Requires an NVIDIA L4 (24 GB) or better at runtime.
# HF Spaces: set hardware to "GPU: L4" and expose port 7860.
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    # Cache HF model weights to the persistent /data volume on HF Spaces.
    HF_HOME=/data/.hf_cache \
    TRANSFORMERS_CACHE=/data/.hf_cache

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
RUN pip install --upgrade pip \
 && pip install -e .[inference] \
 && pip install "uvicorn[standard]>=0.32.0"

COPY . .

# 7860 — public FastAPI endpoint (HF Spaces requirement)
# 8001 — vLLM internal (not exposed; only used by the agent worker)
EXPOSE 7860

CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 7860"]
