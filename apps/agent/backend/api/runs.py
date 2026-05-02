"""Agent-run query endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import AgentRun, RunStatus, User, Project
from backend.db.schemas import AgentRunListItem, AgentRunOut
from backend.db.session import get_session
from backend.auth import get_current_user

router = APIRouter()


@router.get("", response_model=list[AgentRunListItem])
async def list_runs(
    project_id: uuid.UUID | None = Query(default=None),
    status_filter: RunStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[AgentRun]:
    stmt = select(AgentRun).join(Project).where(Project.user_id == user.id)
    if project_id is not None:
        stmt = stmt.where(AgentRun.project_id == project_id)
    if status_filter is not None:
        stmt = stmt.where(AgentRun.status == status_filter)
    stmt = stmt.order_by(AgentRun.started_at.desc()).limit(limit)
    rows = await session.execute(stmt)
    return list(rows.scalars().all())


@router.get("/{run_id}", response_model=AgentRunOut)
async def get_run(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AgentRun:
    row = await session.execute(
        select(AgentRun).join(Project).where(AgentRun.id == run_id).where(Project.user_id == user.id)
    )
    run = row.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/{run_id}/cancel", response_model=AgentRunOut)
async def cancel_run(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AgentRun:
    row = await session.execute(
        select(AgentRun).join(Project).where(AgentRun.id == run_id).where(Project.user_id == user.id)
    )
    run = row.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.pending, RunStatus.running):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel run in status {run.status.value}",
        )
    run.status = RunStatus.failed
    run.violation = "cancelled_by_user"
    run.finished_at = datetime.now(timezone.utc)
    await session.flush()
    return run
