#!/bin/bash
set -e

_shutdown() {
    echo "[entrypoint] Shutting down all processes..."
    kill 0 2>/dev/null || true
    wait 2>/dev/null || true
}
trap _shutdown EXIT TERM INT

# ── DB migrations ─────────────────────────────────────────────────────────────
echo "[entrypoint] Running alembic migrations..."
cd /app && alembic upgrade head

# ── Nginx ─────────────────────────────────────────────────────────────────────
echo "[entrypoint] Starting nginx on :7860..."
nginx

# ── Next.js ──────────────────────────────────────────────────────────────────
echo "[entrypoint] Starting Next.js on :3000..."
node /app/web/node_modules/.bin/next start /app/web --port 3000 &
NEXT_PID=$!

# ── FastAPI (+ optional vLLM subprocess via VLLM_AUTO_START) ─────────────────
echo "[entrypoint] Starting FastAPI on :8000..."
cd /app && uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
FASTAPI_PID=$!

echo "[entrypoint] All services running. next=$NEXT_PID fastapi=$FASTAPI_PID"
wait $NEXT_PID $FASTAPI_PID
