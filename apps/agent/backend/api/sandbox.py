"""Sandbox test endpoint — one-shot prepare + run_tests."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_settings
from backend.sandbox.runner import SandboxRunner

router = APIRouter()
logger = logging.getLogger(__name__)


class SandboxTestRequest(BaseModel):
    repo_path: str
    language: Literal["python", "javascript", "typescript", "rust"]


class SandboxTestResponse(BaseModel):
    docker_used: bool
    baseline: dict[str, Any]
    result: dict[str, Any]
    violation: str | None


def _run_sandbox_sync(repo_path: str, language: str) -> dict[str, Any]:
    settings = get_settings()
    runner = SandboxRunner(
        repo_path=Path(repo_path),
        language=language,
        cpu_count=settings.sandbox_cpu_count,
        memory_mb=settings.sandbox_memory_mb,
        test_timeout_seconds=settings.sandbox_test_timeout_seconds,
    )
    try:
        baseline = runner.prepare()
        result = runner.run_tests(timeout_seconds=settings.sandbox_test_timeout_seconds)
        return {
            "docker_used": runner.use_docker,
            "baseline": baseline.to_dict(),
            "result": result,
            "violation": runner.violation,
        }
    finally:
        runner.cleanup()


@router.post("/test", response_model=SandboxTestResponse)
async def test_sandbox(req: SandboxTestRequest) -> SandboxTestResponse:
    if not Path(req.repo_path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {req.repo_path}")
    try:
        data = await asyncio.to_thread(_run_sandbox_sync, req.repo_path, req.language)
    except Exception as exc:
        logger.exception("Sandbox test failed")
        raise HTTPException(status_code=500, detail=str(exc))
    return SandboxTestResponse(**data)


@router.get("/status")
async def sandbox_status() -> dict[str, bool]:
    docker_ok = await asyncio.to_thread(SandboxRunner._docker_available)
    return {"docker_available": docker_ok}
