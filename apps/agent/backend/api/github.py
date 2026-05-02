"""GitHub OAuth and repository action endpoints."""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db.models import Project
from backend.db.schemas import (
    GithubBranchCreate,
    GithubCommitCreate,
    GithubPullRequestCreate,
    GithubRepoList,
    GithubSelectRepo,
)
from backend.db.session import get_session
from backend.services.github_client import GithubClient

router = APIRouter()


async def _get_project_or_404(session: AsyncSession, project_id: uuid.UUID) -> Project:
    row = await session.execute(select(Project).where(Project.id == project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _require_oauth_settings() -> None:
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")


@router.get("/oauth/start")
async def oauth_start(project_id: uuid.UUID) -> dict[str, str]:
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_oauth_redirect_url,
        "scope": settings.github_oauth_scopes,
        "state": str(project_id),
    }
    return {"url": f"https://github.com/login/oauth/authorize?{urlencode(params)}"}


@router.get("/oauth/callback")
async def oauth_callback(
    code: str,
    state: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    _require_oauth_settings()
    settings = get_settings()

    async with httpx.AsyncClient(timeout=30.0) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_oauth_redirect_url,
            },
        )

    if token_res.status_code >= 400:
        raise HTTPException(status_code=502, detail="GitHub token exchange failed")

    payload = token_res.json()
    token = payload.get("access_token")
    if not token:
        raise HTTPException(status_code=400, detail="GitHub OAuth failed")

    project = await _get_project_or_404(session, state)

    client = GithubClient(token)
    try:
        me = await client.get_authenticated_user()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub user lookup failed") from exc

    project.github_connected = True
    project.github_username = str(me.get("login") or "") or None
    project.github_access_token = token

    return {"status": "connected"}


@router.get("/repos", response_model=GithubRepoList)
async def list_repos(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> GithubRepoList:
    project = await _get_project_or_404(session, project_id)
    if not project.github_access_token:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    client = GithubClient(project.github_access_token)
    try:
        repos = await client.list_repos()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub repo listing failed") from exc

    return GithubRepoList(
        repos=[
            {
                "full_name": repo["full_name"],
                "default_branch": repo["default_branch"],
                "private": repo["private"],
            }
            for repo in repos
            if "full_name" in repo and "default_branch" in repo and "private" in repo
        ]
    )


@router.post("/repos/select")
async def select_repo(
    payload: GithubSelectRepo,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    project = await _get_project_or_404(session, payload.project_id)
    project.github_repo_full_name = payload.repo_full_name
    return {"status": "selected"}


@router.get("/repo/tree")
async def get_repo_tree(
    project_id: uuid.UUID,
    ref: str = "HEAD",
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    project = await _get_project_or_404(session, project_id)
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub repo not selected")

    client = GithubClient(project.github_access_token)
    try:
        return await client.get_repo_tree(project.github_repo_full_name, ref)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub repo tree lookup failed") from exc


@router.get("/repo/file")
async def get_repo_file(
    project_id: uuid.UUID,
    path: str,
    ref: str = "HEAD",
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    project = await _get_project_or_404(session, project_id)
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub repo not selected")

    client = GithubClient(project.github_access_token)
    try:
        return await client.get_file(project.github_repo_full_name, path, ref)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub file lookup failed") from exc


@router.post("/branches")
async def create_branch(
    payload: GithubBranchCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    project = await _get_project_or_404(session, payload.project_id)
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub repo not selected")

    client = GithubClient(project.github_access_token)
    try:
        return await client.create_branch(
            project.github_repo_full_name,
            payload.new_branch,
            payload.base_sha,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub branch creation failed") from exc


@router.post("/commits")
async def create_commit(
    payload: GithubCommitCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    project = await _get_project_or_404(session, payload.project_id)
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub repo not selected")

    client = GithubClient(project.github_access_token)
    try:
        return await client.create_commit(
            project.github_repo_full_name,
            payload.message,
            payload.tree,
            payload.parents,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub commit creation failed") from exc


@router.post("/pulls")
async def create_pull(
    payload: GithubPullRequestCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    project = await _get_project_or_404(session, payload.project_id)
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub repo not selected")

    client = GithubClient(project.github_access_token)
    try:
        return await client.create_pull_request(
            project.github_repo_full_name,
            payload.title,
            payload.head,
            payload.base,
            payload.body,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub pull request creation failed") from exc
