"""APScheduler glue — polls PyPI/npm on a cron and triggers agent runs."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db.models import AgentRun, Dependency, Ecosystem, RunStatus
from backend.db.session import SessionLocal
from backend.watcher import npm, pypi

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _check_dep(
    session: AsyncSession, dep: Dependency, client: httpx.AsyncClient
) -> bool:
    """Update dep.target_version if a newer release exists. Return True if so."""
    latest: str | None = None
    if dep.ecosystem == Ecosystem.pypi:
        latest = await pypi.latest_pypi_version(dep.name, client=client)
    elif dep.ecosystem == Ecosystem.npm:
        latest = await npm.latest_npm_version(dep.name, client=client)
    else:
        logger.debug("Ecosystem %s not yet supported", dep.ecosystem)

    dep.last_checked_at = datetime.now(timezone.utc)
    if latest is None:
        return False

    is_newer = (
        pypi.is_newer if dep.ecosystem == Ecosystem.pypi else npm.is_newer
    )(dep.current_version, latest)
    if is_newer and dep.target_version != latest:
        dep.target_version = latest
        await _trigger_run(session, dep)
        return True
    return False


async def _trigger_run(session: AsyncSession, dep: Dependency) -> None:
    """Create a pending AgentRun for an upgrade. The agent worker picks it up."""
    existing = await session.execute(
        select(AgentRun).where(
            AgentRun.dependency_id == dep.id,
            AgentRun.status.in_((RunStatus.pending, RunStatus.running)),
        )
    )
    if existing.scalar_one_or_none() is not None:
        return
    run = AgentRun(
        project_id=dep.project_id,
        dependency_id=dep.id,
        status=RunStatus.pending,
        steps=[],
        from_version=dep.current_version,
        to_version=dep.target_version,
    )
    session.add(run)
    logger.info(
        "Queued upgrade run dep=%s %s -> %s", dep.name, dep.current_version, dep.target_version
    )


async def check_project_now(
    session: AsyncSession, project_id: uuid.UUID
) -> tuple[int, int]:
    """Force a poll for one project. Returns (deps_checked, upgrades_found)."""
    rows = await session.execute(
        select(Dependency).where(Dependency.project_id == project_id)
    )
    deps = list(rows.scalars().all())
    found = 0
    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "graft-watcher/0.1"}) as c:
        for dep in deps:
            if await _check_dep(session, dep, c):
                found += 1
    return len(deps), found


async def _scan_all() -> None:
    """Scheduled tick: scan every dep across every project."""
    async with SessionLocal() as session:
        try:
            rows = await session.execute(select(Dependency))
            deps = list(rows.scalars().all())
            logger.info("Watcher tick: scanning %d deps", len(deps))
            async with httpx.AsyncClient(
                timeout=10.0, headers={"User-Agent": "graft-watcher/0.1"}
            ) as c:
                tasks = [_check_dep(session, d, c) for d in deps]
                results = await asyncio.gather(*tasks, return_exceptions=True)
            await session.commit()
            upgrades = sum(1 for r in results if r is True)
            errs = [r for r in results if isinstance(r, Exception)]
            logger.info("Watcher tick done: upgrades=%d errors=%d", upgrades, len(errs))
        except Exception:
            await session.rollback()
            logger.exception("Watcher tick failed")


def start_scheduler() -> AsyncIOScheduler:
    """Wire AsyncIOScheduler into the running event loop. Idempotent."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    settings = get_settings()
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _scan_all,
        "interval",
        minutes=settings.dep_poll_interval_minutes,
        id="watcher_scan",
        next_run_time=datetime.now(timezone.utc),
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info(
        "Watcher scheduler started (interval=%dm)", settings.dep_poll_interval_minutes
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
