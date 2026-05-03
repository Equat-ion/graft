"""GitHub-based trigger endpoint.

Accepts a job trigger from the Next.js frontend, creates or upserts the project
and dependency records in the backend DB, then enqueues a pending AgentRun that
the orchestrator will pick up. The orchestrator clones the repo on the fly and
opens a PR after a successful upgrade.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import AgentRun, Dependency, Ecosystem, Language, Project, RunStatus
from backend.db.session import get_session

router = APIRouter()


class GithubTriggerPayload(BaseModel):
    job_id: str
    project_id: str            # Frontend project UUID — reused as backend project ID
    project_name: str
    repo_full_name: str
    default_branch: str = "main"
    installation_id: Optional[str] = None
    dep_name: str
    dep_ecosystem: str         # "pypi" | "npm"
    from_version: str
    to_version: str
    user_id: str
    webhook_url: Optional[str] = None


class GithubTriggerResult(BaseModel):
    run_id: str
    project_id: str
    job_id: str


def _detect_language(ecosystem: str) -> Language:
    return Language.python if ecosystem == "pypi" else Language.javascript


@router.post("/github-trigger", response_model=GithubTriggerResult)
async def github_trigger(
    payload: GithubTriggerPayload,
    session: AsyncSession = Depends(get_session),
) -> GithubTriggerResult:
    """
    Upserts a Project + Dependency in the backend DB (using the same UUID
    as the frontend project) and creates a pending AgentRun.
    The orchestrator will clone the GitHub repo before executing.
    """
    project_uuid = uuid.UUID(payload.project_id)
    language = _detect_language(payload.dep_ecosystem)

    # Repo will be cloned to this path by the orchestrator before the sandbox runs
    repo_path = str(Path(f"/tmp/graft/{payload.project_id}"))

    # Upsert project — use INSERT ... ON CONFLICT DO UPDATE so we can run the
    # same project multiple times without needing to check first.
    stmt = (
        pg_insert(Project.__table__)
        .values(
            id=project_uuid,
            name=payload.project_name,
            repo_path=repo_path,
            language=language,
            user_id=payload.user_id,
            github_connected=True,
            github_repo_full_name=payload.repo_full_name,
            github_installation_id=payload.installation_id,
            github_default_branch=payload.default_branch,
        )
        .on_conflict_do_update(
            index_elements=["id"],
            set_=dict(
                name=payload.project_name,
                github_repo_full_name=payload.repo_full_name,
                github_installation_id=payload.installation_id,
                github_default_branch=payload.default_branch,
            ),
        )
    )
    await session.execute(stmt)

    # Upsert dependency
    try:
        ecosystem = Ecosystem(payload.dep_ecosystem)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown ecosystem: {payload.dep_ecosystem}",
        )

    dep_row = await session.execute(
        select(Dependency).where(
            Dependency.project_id == project_uuid,
            Dependency.name == payload.dep_name,
        )
    )
    dep = dep_row.scalar_one_or_none()
    if dep is None:
        dep = Dependency(
            project_id=project_uuid,
            name=payload.dep_name,
            current_version=payload.from_version,
            target_version=payload.to_version,
            ecosystem=ecosystem,
        )
        session.add(dep)
        await session.flush()
    else:
        dep.current_version = payload.from_version
        dep.target_version = payload.to_version

    # Create the pending run (skip if one already exists for this dep)
    existing = await session.execute(
        select(AgentRun).where(
            AgentRun.dependency_id == dep.id,
            AgentRun.status.in_((RunStatus.pending, RunStatus.running)),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="An upgrade run for this dependency is already queued or running.",
        )

    run = AgentRun(
        project_id=project_uuid,
        dependency_id=dep.id,
        status=RunStatus.pending,
        steps=[],
        from_version=payload.from_version,
        to_version=payload.to_version,
    )
    # Stash the frontend job_id and webhook_url so the orchestrator can call back
    run.steps = [{"_meta": {"job_id": payload.job_id, "webhook_url": payload.webhook_url}}]
    session.add(run)
    await session.flush()
    await session.commit()

    return GithubTriggerResult(
        run_id=str(run.id),
        project_id=str(project_uuid),
        job_id=payload.job_id,
    )
