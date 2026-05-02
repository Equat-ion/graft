"""Pydantic v2 schemas for API I/O."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.db.models import Ecosystem, Language, RunStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    repo_path: str = Field(min_length=1, max_length=2048)
    language: Language


class DependencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    current_version: str
    target_version: str | None
    ecosystem: Ecosystem
    last_checked_at: datetime | None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    repo_path: str
    language: Language
    user_id: str
    created_at: datetime
    dependencies: list[DependencyOut] = Field(default_factory=list)
    github_connected: bool
    github_username: str | None
    github_repo_full_name: str | None


class ProjectListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    repo_path: str
    language: Language
    user_id: str
    created_at: datetime
    github_connected: bool
    github_username: str | None
    github_repo_full_name: str | None


class GithubRepo(BaseModel):
    full_name: str
    default_branch: str
    private: bool


class GithubRepoList(BaseModel):
    repos: list[GithubRepo]


class GithubSelectRepo(BaseModel):
    project_id: uuid.UUID
    repo_full_name: str


class GithubBranchCreate(BaseModel):
    project_id: uuid.UUID
    base_sha: str
    new_branch: str


class GithubCommitCreate(BaseModel):
    project_id: uuid.UUID
    message: str
    tree: str
    parents: list[str]


class GithubPullRequestCreate(BaseModel):
    project_id: uuid.UUID
    title: str
    head: str
    base: str
    body: str | None = None


class DependencyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    current_version: str = Field(min_length=1, max_length=64)
    ecosystem: Ecosystem


class StepRecord(BaseModel):
    """One tool-call record stored inside AgentRun.steps JSON."""

    step_no: int
    tool: str
    args: dict[str, Any]
    result: str
    timestamp: datetime
    duration_ms: int | None = None


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    dependency_id: uuid.UUID
    status: RunStatus
    steps: list[dict[str, Any]]
    reward: float | None
    from_version: str | None
    to_version: str | None
    baseline_passed: int | None
    baseline_failed: int | None
    final_passed: int | None
    final_failed: int | None
    violation: str | None
    started_at: datetime
    finished_at: datetime | None


class AgentRunListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    dependency_id: uuid.UUID
    status: RunStatus
    reward: float | None
    from_version: str | None
    to_version: str | None
    started_at: datetime
    finished_at: datetime | None


class CheckResult(BaseModel):
    project_id: uuid.UUID
    deps_checked: int
    upgrades_found: int
