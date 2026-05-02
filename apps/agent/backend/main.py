"""FastAPI app entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agent.orchestrator import start_worker, stop_worker
from backend.api import deps, github, projects, runs
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


app = FastAPI(
    title="Graft API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(deps.router, prefix="/api/deps", tags=["deps"])
app.include_router(github.router, prefix="/api/github", tags=["github"])


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "llm_model": settings.llm_model,
        "llm_base_url": settings.llm_base_url,
    }
