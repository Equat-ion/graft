"""FastAPI app entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agent.orchestrator import start_worker, stop_worker
from backend.api import agent, deps, github, inference, projects, runs, sandbox
from backend.config import get_settings
from backend.watcher.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    if settings.vllm_auto_start:
        from backend.agent.vllm_server import start_vllm_server, stop_vllm_server

        logger.info(
            "VLLM_AUTO_START=true — launching vLLM subprocess (timeout=%ds)",
            settings.vllm_startup_timeout,
        )
        loop = asyncio.get_event_loop()
        try:
            vllm_url = await loop.run_in_executor(None, start_vllm_server)
            logger.info("vLLM ready at %s", vllm_url)
        except Exception:
            logger.exception("vLLM failed to start; agent runs will fail")

    logger.info(
        "Graft starting | LLM base_url=%s model=%s",
        settings.llm_base_url,
        settings.llm_model,
    )
    start_scheduler()
    start_worker(app)

    yield

    stop_worker()
    stop_scheduler()
    if settings.vllm_auto_start:
        from backend.agent.vllm_server import stop_vllm_server
        stop_vllm_server()


app = FastAPI(
    title="Graft API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(deps.router, prefix="/api/deps", tags=["deps"])
app.include_router(github.router, prefix="/api/github", tags=["github"])
app.include_router(sandbox.router, prefix="/api/sandbox", tags=["sandbox"])
app.include_router(inference.router, prefix="/api/inference", tags=["inference"])


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
        "llm_base_url": settings.llm_base_url,
    }
