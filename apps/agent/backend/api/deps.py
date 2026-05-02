"""Dependency listing and on-demand check endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Dependency, Project, User
from backend.db.schemas import CheckResult, DependencyOut
from backend.db.session import get_session
from backend.auth import get_current_user
from backend.watcher.scheduler import check_project_now

router = APIRouter()


@router.get("/{project_id}", response_model=list[DependencyOut])
async def list_deps(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[Dependency]:
    project = await session.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    rows = await session.execute(
        select(Dependency).where(Dependency.project_id == project_id).order_by(Dependency.name)
    )
    return list(rows.scalars().all())


@router.post("/check-now/{project_id}", response_model=CheckResult)
async def check_now(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CheckResult:
    project = await session.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    deps_checked, upgrades_found = await check_project_now(session, project_id)
    await session.flush()
    return CheckResult(
        project_id=project_id,
        deps_checked=deps_checked,
        upgrades_found=upgrades_found,
    )
