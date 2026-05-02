"""Project CRUD endpoints."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models import Project
from backend.db.schemas import ProjectCreate, ProjectListItem, ProjectOut
from backend.db.session import get_session

router = APIRouter()


@router.get("", response_model=list[ProjectListItem])
async def list_projects(session: AsyncSession = Depends(get_session)) -> list[Project]:
    rows = await session.execute(select(Project).order_by(Project.created_at.desc()))
    return list(rows.scalars().all())


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, session: AsyncSession = Depends(get_session)
) -> Project:
    repo = Path(payload.repo_path).expanduser().resolve()
    if not repo.exists():
        raise HTTPException(
            status_code=400, detail=f"repo_path does not exist: {repo}"
        )
    if not repo.is_dir():
        raise HTTPException(
            status_code=400, detail=f"repo_path must be a directory: {repo}"
        )

    project = Project(
        name=payload.name,
        repo_path=str(repo),
        language=payload.language,
    )
    session.add(project)
    await session.flush()
    await session.refresh(project, attribute_names=["dependencies"])
    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> Project:
    row = await session.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.dependencies))
    )
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    row = await session.execute(select(Project).where(Project.id == project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    await session.delete(project)
