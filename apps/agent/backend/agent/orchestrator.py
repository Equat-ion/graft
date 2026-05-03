"""Background worker: drains pending AgentRun rows through the LangGraph agent.

Lifecycle:
    start_worker(app)       — call from FastAPI lifespan
    stop_worker()           — call on shutdown

The worker polls every few seconds. When it picks up a pending run, it:
    1. Clones the GitHub repo (if project uses GitHub App installation)
       OR uses the existing local repo_path
    2. Creates a SandboxRunner and snapshots the repo
    3. Runs the baseline test suite
    4. Builds a LangGraph episode
    5. Streams step records into the AgentRun.steps JSON column
    6. Persists final reward + status
    7. If successful: creates a branch, commits changes, pushes, opens a PR
    8. Notifies the frontend webhook with the job result
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.agent.session import AgentSession, set_active_session
from backend.config import get_settings
from backend.db.models import AgentRun, Dependency, Project, RunStatus
from backend.db.session import SessionLocal
from backend.sandbox.runner import SandboxRunner

logger = logging.getLogger(__name__)

_worker_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None
POLL_INTERVAL_SECONDS = 3.0


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_installation_token(installation_id: str) -> str | None:
    """Generate a short-lived GitHub App installation access token."""
    settings = get_settings()
    if not settings.github_app_id or not settings.github_app_private_key:
        logger.warning("GitHub App credentials not configured — cannot clone via App")
        return None
    try:
        from backend.services.github_app import get_installation_token
        return await get_installation_token(
            settings.github_app_id,
            settings.github_app_private_key,
            installation_id,
        )
    except Exception:
        logger.exception("Failed to get GitHub App installation token")
        return None


async def _clone_repo(repo_full_name: str, token: str, dest: Path, branch: str) -> bool:
    """Git-clone a GitHub repo into dest using an installation token."""
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    clone_url = f"https://x-access-token:{token}@github.com/{repo_full_name}.git"
    result = await asyncio.to_thread(
        subprocess.run,
        ["git", "clone", "--depth=1", "--branch", branch, clone_url, str(dest)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.error("git clone failed: %s", result.stderr)
        return False
    logger.info("Cloned %s → %s", repo_full_name, dest)
    return True


def _create_pr_branch(
    repo_path: Path,
    workspace: Path,
    dep_name: str,
    to_version: str,
    token: str,
    repo_full_name: str,
    base_branch: str,
) -> dict[str, Any] | None:
    """
    Copy workspace changes back to repo_path, commit on a new branch, push, and
    call the GitHub API to open a PR. Returns the PR data dict or None on failure.
    """
    branch_name = f"graft/upgrade-{dep_name.replace('_', '-')}-{to_version}"
    commit_msg = f"chore: upgrade {dep_name} to {to_version} [graft]"

    try:
        # Copy all files from workspace to repo_path (preserving .git)
        for f in workspace.rglob("*"):
            if f.is_file():
                rel = f.relative_to(workspace)
                dest = repo_path / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)

        # Authenticate and create branch
        remote_url = f"https://x-access-token:{token}@github.com/{repo_full_name}.git"
        subprocess.run(
            ["git", "-C", str(repo_path), "remote", "set-url", "origin", remote_url],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "checkout", "-b", branch_name],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "config", "user.email", "graft-bot@users.noreply.github.com"],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "config", "user.name", "Graft Bot"],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "add", "-A"],
            check=True, capture_output=True,
        )
        result = subprocess.run(
            ["git", "-C", str(repo_path), "diff", "--cached", "--quiet"],
            capture_output=True,
        )
        if result.returncode == 0:
            logger.info("No changes to commit for %s upgrade", dep_name)
            return None

        subprocess.run(
            ["git", "-C", str(repo_path), "commit", "-m", commit_msg],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "push", "origin", branch_name],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        logger.error(
            "Git operation failed: %s\nstdout: %s\nstderr: %s",
            e.cmd, e.stdout, e.stderr,
        )
        return None

    # Open PR via GitHub API
    pr_body = (
        f"Automated dependency upgrade by [Graft](https://github.com/apps/graft-app).\n\n"
        f"Upgrades `{dep_name}` to `{to_version}`."
    )
    try:
        owner, repo = repo_full_name.split("/", 1)
        resp = httpx.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={
                "title": f"chore: upgrade {dep_name} to {to_version}",
                "head": branch_name,
                "base": base_branch,
                "body": pr_body,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        logger.error("PR creation failed: %s", exc)
        return None


async def _notify_webhook(
    webhook_url: str,
    job_id: str,
    status: str,
    pr_url: str | None,
    pr_number: int | None,
    logs: str | None,
) -> None:
    settings = get_settings()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.agent_webhook_secret:
        headers["x-agent-secret"] = settings.agent_webhook_secret
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                webhook_url,
                json={
                    "job_id": job_id,
                    "status": status,
                    "pr_url": pr_url,
                    "pr_number": pr_number,
                    "logs": logs,
                },
                headers=headers,
            )
    except Exception:
        logger.warning("Failed to notify frontend webhook at %s", webhook_url)


def _extract_meta(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Pull the _meta stashed by the trigger endpoint out of the first step."""
    if steps and "_meta" in steps[0]:
        return steps[0]["_meta"]
    return {}


# ── Worker internals ──────────────────────────────────────────────────────────

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
        meta = _extract_meta(list(run.steps or []))
        installation_id: str | None = project.github_installation_id
        github_repo_full_name: str | None = project.github_repo_full_name
        github_default_branch: str = project.github_default_branch or "main"

    # ── Step 1: Clone GitHub repo if using installation auth ──────────────────
    clone_token: str | None = None

    if installation_id and github_repo_full_name:
        clone_token = await _get_installation_token(installation_id)
        if clone_token:
            default_branch = github_default_branch
            cloned = await _clone_repo(
                github_repo_full_name,
                clone_token,
                repo_path,
                default_branch,
            )
            if not cloned:
                async with SessionLocal() as session:
                    run = await session.get(AgentRun, run_id)
                    if run:
                        run.status = RunStatus.failed
                        run.violation = "git_clone_failed"
                        run.finished_at = datetime.now(timezone.utc)
                        await session.commit()
                if meta.get("webhook_url"):
                    await _notify_webhook(
                        meta["webhook_url"], meta.get("job_id", ""),
                        "failed", None, None, "git clone failed",
                    )
                return
        else:
            logger.warning(
                "No token for installation %s — trying existing repo_path", installation_id
            )
    elif not repo_path.exists():
        async with SessionLocal() as session:
            run = await session.get(AgentRun, run_id)
            if run:
                run.status = RunStatus.failed
                run.violation = f"repo_path does not exist: {repo_path}"
                run.finished_at = datetime.now(timezone.utc)
                await session.commit()
        return

    # ── Step 2: Run the agent episode ─────────────────────────────────────────
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
        if meta.get("webhook_url"):
            await _notify_webhook(
                meta["webhook_url"], meta.get("job_id", ""),
                "failed", None, None, str(e),
            )
        sandbox.cleanup()
        return

    # ── Step 3: Persist results ───────────────────────────────────────────────
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

    success = run.status == RunStatus.success
    run_violation = run.violation

    # ── Step 4: Create PR if upgrade succeeded ────────────────────────────────
    pr_url: str | None = None
    pr_number: int | None = None

    if (
        success
        and clone_token
        and github_repo_full_name
        and installation_id
    ):
        logger.info("Creating PR for run %s", run_id)
        pr_data = await asyncio.to_thread(
            _create_pr_branch,
            repo_path,
            sandbox.workspace,
            dep_name,
            to_version,
            clone_token,
            github_repo_full_name,
            github_default_branch,
        )
        if pr_data:
            pr_url = pr_data.get("html_url")
            pr_number = pr_data.get("number")
            logger.info("PR created: %s", pr_url)

    # ── Step 5: Notify frontend webhook ──────────────────────────────────────
    webhook_url = meta.get("webhook_url") or settings.frontend_webhook_url
    job_id = meta.get("job_id", "")

    if webhook_url and job_id:
        final_status = "pr-open" if pr_url else ("failed" if not success else "running")
        await _notify_webhook(
            webhook_url, job_id, final_status, pr_url, pr_number,
            logs=run_violation,
        )

    sandbox.cleanup()
    logger.info(
        "Run %s finished: status=%s reward=%s pr=%s",
        run_id, run.status, run.reward, pr_url,
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
