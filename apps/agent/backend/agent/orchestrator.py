"""Background worker: drains pending AgentRun rows through the LangGraph agent.

Lifecycle:
    start_worker(app)       — call from FastAPI lifespan
    stop_worker()           — call on shutdown

The worker polls every few seconds. When it picks up a pending run, it:
    1. Creates a SandboxRunner and snapshots the repo
    2. Runs the baseline test suite
    3. Builds a LangGraph episode
    4. Streams step records into the AgentRun.steps JSON column
    5. Persists final reward + status
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.agent.session import AgentSession, set_active_session
from backend.config import get_settings
from backend.db.models import AgentRun, Dependency, Project, RunStatus
from backend.db.session import SessionLocal
from backend.services.repo_bootstrap import bootstrap_github_repo
from backend.sandbox.runner import SandboxRunner

logger = logging.getLogger(__name__)

_worker_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None
POLL_INTERVAL_SECONDS = 3.0


async def _claim_one(session: AsyncSession) -> AgentRun | None:
    row = await session.execute(
        select(AgentRun)
        .where(AgentRun.status == RunStatus.pending)
        .order_by(AgentRun.started_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    run = row.scalar_one_or_none()
    if run is None:
        return None
    run.status = RunStatus.running
    run.started_at = datetime.now(timezone.utc)
    await session.flush()
    return run


async def _persist_step(run_id: uuid.UUID, record: dict[str, Any]) -> None:
    async with SessionLocal() as session:
        run = await session.get(AgentRun, run_id)
        if run is None:
            return
        steps = list(run.steps or [])
        steps.append(record)
        run.steps = steps
        await session.commit()


def _emit_step_callback(run_id: uuid.UUID, loop: asyncio.AbstractEventLoop):
    def _cb(record: dict[str, Any]) -> None:
        asyncio.run_coroutine_threadsafe(_persist_step(run_id, record), loop)
    return _cb

async def _execute_run(app: FastAPI, run_id: uuid.UUID) -> None:
    settings = get_settings()
    bootstrap_workspace_root: Path | None = None

    async with SessionLocal() as session:
        run = await session.get(AgentRun, run_id)
        if run is None:
            return
        dep = await session.get(Dependency, run.dependency_id)
        project = await session.get(Project, run.project_id)
        if dep is None or project is None:
            run.status = RunStatus.failed
            run.violation = "missing_project_or_dependency"
            run.finished_at = datetime.now(timezone.utc)
            await session.commit()
            return
        from_version = run.from_version or dep.current_version
        to_version = run.to_version or dep.target_version or dep.current_version
        repo_path = Path(project.repo_path)
        language = project.language.value
        dep_name = dep.name
        github_repo_full_name = project.github_repo_full_name
        github_access_token = project.github_access_token

    if github_repo_full_name:
        try:
            bootstrap = await asyncio.to_thread(
                bootstrap_github_repo,
                repo_full_name=github_repo_full_name,
                run_id=run_id,
                access_token=github_access_token,
                image=settings.bootstrap_git_image,
                timeout_seconds=settings.bootstrap_git_timeout_seconds,
            )
        except Exception as e:
            logger.exception("Repo bootstrap failed for run %s", run_id)
            async with SessionLocal() as session:
                run = await session.get(AgentRun, run_id)
                if run is not None:
                    run.status = RunStatus.failed
                    run.violation = f"bootstrap_failed: {type(e).__name__}"[:255]
                    run.finished_at = datetime.now(timezone.utc)
                    await session.commit()
            return
        repo_path = bootstrap.repo_path
        bootstrap_workspace_root = bootstrap.workspace_root
        logger.info(
            "Run %s bootstrapped repo %s on branch %s",
            run_id,
            github_repo_full_name,
            bootstrap.branch_name,
        )

    sandbox = SandboxRunner(
        repo_path=repo_path,
        language=language,
        cpu_count=settings.sandbox_cpu_count,
        memory_mb=settings.sandbox_memory_mb,
        test_timeout_seconds=settings.sandbox_test_timeout_seconds,
    )

    loop = asyncio.get_running_loop()

    def _run_episode() -> dict[str, Any]:
        from backend.agent.graph import build_graph

        baseline = sandbox.prepare()
        graph = build_graph()
        agent_session = AgentSession(
            run_id=run_id,
            workspace=sandbox.workspace,
            language=language,
            dep_name=dep_name,
            from_version=from_version,
            to_version=to_version,
            sandbox=sandbox,
        )
        agent_session.on_step = _emit_step_callback(run_id, loop)
        set_active_session(agent_session)

        initial_state: dict[str, Any] = {
            "run_id": str(run_id),
            "repo_path": str(repo_path),
            "dep_name": dep_name,
            "from_version": from_version,
            "to_version": to_version,
            "baseline_passed": baseline.passed,
            "baseline_failed": baseline.failed,
            "max_steps": settings.agent_max_steps,
            "messages": [],
            "steps_taken": 0,
            "submitted": False,
        }
        config = {"configurable": {"thread_id": str(run_id)}, "recursion_limit": 200}
        try:
            return graph.invoke(initial_state, config=config)
        finally:
            set_active_session(None)

    try:
        final_state = await asyncio.to_thread(_run_episode)
    except Exception as e:
        logger.exception("Episode crashed for run %s", run_id)
        async with SessionLocal() as session:
            run = await session.get(AgentRun, run_id)
            if run is not None:
                run.status = RunStatus.failed
                run.violation = f"crash: {type(e).__name__}: {e}"[:255]
                run.finished_at = datetime.now(timezone.utc)
                await session.commit()
        sandbox.cleanup()
        if bootstrap_workspace_root is not None:
            shutil.rmtree(bootstrap_workspace_root, ignore_errors=True)
        return

    async with SessionLocal() as session:
        run = await session.get(AgentRun, run_id)
        if run is None:
            sandbox.cleanup()
            return
        violation = final_state.get("violation")
        reward = final_state.get("final_reward")
        run.reward = reward
        run.final_passed = final_state.get("final_passed")
        run.final_failed = final_state.get("final_failed")
        run.violation = violation
        baseline = sandbox.baseline()
        run.baseline_passed = baseline.passed
        run.baseline_failed = baseline.failed
        run.finished_at = datetime.now(timezone.utc)
        if violation == "cancelled_by_user":
            run.status = RunStatus.failed
        elif violation:
            run.status = (
                RunStatus.tamper_detected
                if "tamper" in violation.lower() or "test" in violation.lower()
                else RunStatus.failed
            )
        elif reward is not None and reward >= 0.5:
            run.status = RunStatus.success
        else:
            run.status = RunStatus.failed
        await session.commit()

    sandbox.cleanup()
    if bootstrap_workspace_root is not None:
        shutil.rmtree(bootstrap_workspace_root, ignore_errors=True)
    logger.info(
        "Run %s finished: status=%s reward=%s steps=%d",
        run_id, run.status, run.reward, len(run.steps or []),
    )


async def _worker_loop(app: FastAPI) -> None:
    assert _stop_event is not None
    logger.info("Agent worker started")
    while not _stop_event.is_set():
        try:
            async with SessionLocal() as session:
                run = await _claim_one(session)
                run_id = run.id if run is not None else None
                if run is not None:
                    await session.commit()
            if run_id is None:
                try:
                    await asyncio.wait_for(_stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    pass
                continue
            await _execute_run(app, run_id)
        except Exception:
            logger.exception("Worker loop iteration failed")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    logger.info("Agent worker stopped")


def start_worker(app: FastAPI) -> None:
    global _worker_task, _stop_event
    if _worker_task is not None:
        return
    loop = asyncio.get_event_loop()
    _stop_event = asyncio.Event()
    _worker_task = loop.create_task(_worker_loop(app), name="graft-agent-worker")


def stop_worker() -> None:
    global _worker_task, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _worker_task is not None:
        _worker_task.cancel()
        _worker_task = None
    _stop_event = None
