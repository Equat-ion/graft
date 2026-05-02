"""FastAPI app entry point.

Lifespan responsibilities:
  - boot the local vLLM server (best available checkpoint) and stash its URL on app.state
  - start the dependency-watcher scheduler
  - boot the agent-run worker that drains pending AgentRun rows
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agent.orchestrator import start_worker, stop_worker
from backend.agent.vllm_server import start_vllm_server, stop_vllm_server
from backend.api import deps, github, projects, runs
from backend.watcher.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.vllm_url = start_vllm_server()
    except Exception:
        logger.exception("vLLM failed to boot — agent runs will fail until it is fixed")
        app.state.vllm_url = None

    start_scheduler()
    start_worker(app)

    yield

    stop_worker()
    stop_scheduler()
    stop_vllm_server()


app = FastAPI(title="Graft API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(deps.router, prefix="/api/deps", tags=["deps"])
app.include_router(github.router, prefix="/api/github", tags=["github"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
