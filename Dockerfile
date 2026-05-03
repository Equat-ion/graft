# ── Stage 1: Build Next.js ────────────────────────────────────────────────────
FROM node:20-slim AS web-builder

WORKDIR /build

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --prefer-offline

COPY apps/web .

# Public env vars are baked into the client bundle at build time.
ARG NEXT_PUBLIC_APP_URL=https://devaanshpathakhf-graft-backend.hf.space
ARG NEXT_PUBLIC_AGENT_URL=https://devaanshpathakhf-graft-backend.hf.space/backend
ARG NEXT_PUBLIC_GITHUB_APP_SLUG=arasaka-graft-app

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_AGENT_URL=$NEXT_PUBLIC_AGENT_URL \
    NEXT_PUBLIC_GITHUB_APP_SLUG=$NEXT_PUBLIC_GITHUB_APP_SLUG \
    # Prevents Next.js from erroring on missing runtime secrets during build
    BETTER_AUTH_SECRET=build-placeholder \
    BETTER_AUTH_URL=$NEXT_PUBLIC_APP_URL \
    DATABASE_URL=postgresql://placeholder

RUN npm run build

# ── Stage 2: Runtime (CUDA + Python + Node + Nginx) ──────────────────────────
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/data/.hf_cache \
    TRANSFORMERS_CACHE=/data/.hf_cache

# System deps: build tools, nginx, Node.js
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential git curl ca-certificates nginx \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# ── Python backend ────────────────────────────────────────────────────────────
WORKDIR /app
COPY apps/agent/pyproject.toml apps/agent/README.md ./
RUN pip install --upgrade pip \
 && pip install -e .[inference] \
 && pip install "uvicorn[standard]>=0.32.0"
COPY apps/agent .

# ── Next.js runtime artefacts (no source needed) ─────────────────────────────
RUN mkdir -p /app/web
COPY --from=web-builder /build/.next       /app/web/.next
COPY --from=web-builder /build/node_modules /app/web/node_modules
COPY --from=web-builder /build/package.json /app/web/package.json
COPY apps/web/public                        /app/web/public

# ── Nginx + entrypoint ────────────────────────────────────────────────────────
COPY deploy/nginx.conf   /etc/nginx/nginx.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 7860 — HF Spaces public port (Nginx)
EXPOSE 7860

CMD ["/entrypoint.sh"]
