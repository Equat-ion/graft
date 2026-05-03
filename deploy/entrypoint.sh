#!/bin/bash
# Entrypoint for the all-in-one HF Spaces container.
# Starts: alembic migrations → nginx → Next.js → FastAPI

_shutdown() {
    echo "[entrypoint] Shutting down all processes..."
    # Kill child processes only, not ourselves
    kill $NEXT_PID $FASTAPI_PID 2>/dev/null || true
    wait $NEXT_PID $FASTAPI_PID 2>/dev/null || true
    exit 0
}
trap _shutdown TERM INT

# ── DB migrations ─────────────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
    echo "[entrypoint] DATABASE_URL is set (${#DATABASE_URL} chars, starts with ${DATABASE_URL:0:25}...)"
else
    echo "[entrypoint] WARNING: DATABASE_URL is NOT set — will use default (localhost:5432)"
fi
echo "[entrypoint] Running alembic migrations..."
cd /app && alembic upgrade head || {
    echo "[entrypoint] WARNING: alembic migrations failed (exit $?). Continuing anyway..."
    echo "[entrypoint] The backend will attempt to connect at runtime."
}

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
