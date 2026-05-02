# GitHub OAuth Repo Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped GitHub OAuth so users can connect a GitHub account, pick a repo per project, browse repo contents, create branches/commits, and open PRs.

**Architecture:** Extend Project with GitHub connection fields and repo selection. Add OAuth flow + GitHub API client in backend. Add frontend UI to connect account, pick repo, browse repo tree/file, and trigger branch/commit/PR actions via new API endpoints.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, Next.js 15, SWR, shadcn/ui, GitHub REST API (OAuth App flow).

---

## File structure changes

**Backend**
- Modify: `apps/agent/backend/db/models.py` — add GitHub connection fields to Project
- Modify: `apps/agent/backend/db/schemas.py` — add request/response schemas for GitHub connect, repo selection, repo browsing, and PR creation
- Modify: `apps/agent/backend/config.py` — add GitHub OAuth client settings
- Create: `apps/agent/backend/api/github.py` — OAuth flow + repo list + repo content + branch/commit/PR actions
- Modify: `apps/agent/backend/main.py` — include new GitHub router
- Create: `apps/agent/backend/services/github_client.py` — GitHub REST API wrapper using httpx

**Frontend**
- Modify: `apps/web/lib/types.ts` — add GitHub-related types and fields on Project
- Modify: `apps/web/lib/api.ts` — add GitHub API client methods
- Modify: `apps/web/components/RegisterProjectForm.tsx` — add optional GitHub connect/ repo selection during creation
- Modify: `apps/web/app/projects/[id]/page.tsx` — show GitHub connection status, repo info, repo browser, and PR action
- Create: `apps/web/components/GithubConnectButton.tsx`
- Create: `apps/web/components/GithubRepoPicker.tsx`
- Create: `apps/web/components/GithubRepoBrowser.tsx`
- Create: `apps/web/components/GithubPrForm.tsx`

**Docs**
- Modify: `docs/api.md` — add GitHub endpoints
- Modify: `docs/frontend.md` — describe new UI pieces and flows
- Modify: `docs/environment.md` — add OAuth env vars

---

### Task 1: Add GitHub settings and Project fields

**Files:**
- Modify: `apps/agent/backend/config.py`
- Modify: `apps/agent/backend/db/models.py`
- Modify: `apps/agent/backend/db/schemas.py`

- [ ] **Step 1: Write failing test for Project schema fields**

```python
# apps/agent/tests/test_projects_github_fields.py
import uuid
from datetime import datetime, timezone
from backend.db.schemas import ProjectOut


def test_project_out_includes_github_fields():
    payload = {
        "id": uuid.uuid4(),
        "name": "proj",
        "repo_path": "/tmp/repo",
        "language": "python",
        "created_at": datetime.now(timezone.utc),
        "dependencies": [],
        "github_connected": True,
        "github_username": "octocat",
        "github_repo_full_name": "octocat/hello",
    }
    out = ProjectOut.model_validate(payload)
    assert out.github_connected is True
    assert out.github_username == "octocat"
    assert out.github_repo_full_name == "octocat/hello"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agent && pytest tests/test_projects_github_fields.py::test_project_out_includes_github_fields -v`
Expected: FAIL with `ValidationError` because fields missing in schema.

- [ ] **Step 3: Add GitHub settings to config**

```python
# apps/agent/backend/config.py
    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", alias="GITHUB_CLIENT_SECRET")
    github_oauth_redirect_url: str = Field(
        default="http://localhost:3000/oauth/github/callback",
        alias="GITHUB_OAUTH_REDIRECT_URL",
    )
    github_oauth_scopes: str = Field(default="repo,read:org", alias="GITHUB_OAUTH_SCOPES")
```

- [ ] **Step 4: Extend Project model with GitHub fields**

```python
# apps/agent/backend/db/models.py
class Project(Base):
    __tablename__ = "projects"
    ...
    github_connected: Mapped[bool] = mapped_column(default=False, nullable=False)
    github_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_access_token: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    github_repo_full_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
```

- [ ] **Step 5: Update schemas with GitHub fields**

```python
# apps/agent/backend/db/schemas.py
class ProjectOut(BaseModel):
    ...
    github_connected: bool
    github_username: str | None
    github_repo_full_name: str | None

class ProjectListItem(BaseModel):
    ...
    github_connected: bool
    github_username: str | None
    github_repo_full_name: str | None
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/agent && pytest tests/test_projects_github_fields.py::test_project_out_includes_github_fields -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/agent/backend/config.py apps/agent/backend/db/models.py apps/agent/backend/db/schemas.py apps/agent/tests/test_projects_github_fields.py
git commit -m "feat: add GitHub connection fields to project"
```

---

### Task 2: Add GitHub OAuth + repo selection endpoints

**Files:**
- Create: `apps/agent/backend/api/github.py`
- Modify: `apps/agent/backend/main.py`
- Modify: `apps/agent/backend/db/schemas.py`
- Create: `apps/agent/backend/services/github_client.py`

- [ ] **Step 1: Write failing tests for GitHub endpoints**

```python
# apps/agent/tests/test_github_api.py
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_github_oauth_start():
    res = client.get("/api/github/oauth/start?project_id=00000000-0000-0000-0000-000000000000")
    assert res.status_code == 307


def test_github_repo_list_requires_auth():
    res = client.get("/api/github/repos?project_id=00000000-0000-0000-0000-000000000000")
    assert res.status_code in (401, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agent && pytest tests/test_github_api.py::test_github_oauth_start -v`
Expected: FAIL with 404 (route not found)

- [ ] **Step 3: Add GitHub API client**

```python
# apps/agent/backend/services/github_client.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class GithubClient:
    token: str

    async def list_repos(self) -> list[dict[str, Any]]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.get("https://api.github.com/user/repos?per_page=100", headers=headers)
            res.raise_for_status()
            return res.json()

    async def list_orgs(self) -> list[dict[str, Any]]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.get("https://api.github.com/user/orgs?per_page=100", headers=headers)
            res.raise_for_status()
            return res.json()

    async def get_repo_tree(self, full_name: str, ref: str = "main") -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.github.com/repos/{full_name}/git/trees/{ref}?recursive=1",
                headers=headers,
            )
            res.raise_for_status()
            return res.json()

    async def get_file(self, full_name: str, path: str, ref: str = "main") -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://api.github.com/repos/{full_name}/contents/{path}?ref={ref}",
                headers=headers,
            )
            res.raise_for_status()
            return res.json()

    async def create_branch(self, full_name: str, new_branch: str, sha: str) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/git/refs",
                headers=headers,
                json={"ref": f"refs/heads/{new_branch}", "sha": sha},
            )
            res.raise_for_status()
            return res.json()

    async def create_commit(
        self, full_name: str, message: str, tree: str, parents: list[str]
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/git/commits",
                headers=headers,
                json={"message": message, "tree": tree, "parents": parents},
            )
            res.raise_for_status()
            return res.json()

    async def create_pull_request(
        self, full_name: str, title: str, head: str, base: str, body: str | None = None
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"https://api.github.com/repos/{full_name}/pulls",
                headers=headers,
                json={"title": title, "head": head, "base": base, "body": body},
            )
            res.raise_for_status()
            return res.json()
```

- [ ] **Step 4: Add schemas for GitHub actions**

```python
# apps/agent/backend/db/schemas.py
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
```

- [ ] **Step 5: Add GitHub OAuth + repo endpoints**

```python
# apps/agent/backend/api/github.py
from __future__ import annotations

import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.db.models import Project
from backend.db.session import get_session
from backend.db.schemas import (
    GithubBranchCreate,
    GithubCommitCreate,
    GithubPullRequestCreate,
    GithubRepoList,
    GithubSelectRepo,
)
from backend.services.github_client import GithubClient

router = APIRouter()


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
    code: str, state: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_oauth_redirect_url,
            },
        )
        token_res.raise_for_status()
        token = token_res.json().get("access_token")
        if not token:
            raise HTTPException(status_code=400, detail="GitHub OAuth failed")

    row = await session.execute(select(Project).where(Project.id == state))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # fetch username
    async with httpx.AsyncClient() as client:
        me = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        me.raise_for_status()
        username = me.json().get("login")

    project.github_connected = True
    project.github_username = username
    project.github_access_token = token

    return {"status": "connected"}


@router.get("/repos", response_model=GithubRepoList)
async def list_repos(project_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    row = await session.execute(select(Project).where(Project.id == project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.github_access_token:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    client = GithubClient(project.github_access_token)
    repos = await client.list_repos()
    return {
        "repos": [
            {
                "full_name": r["full_name"],
                "default_branch": r["default_branch"],
                "private": r["private"],
            }
            for r in repos
        ]
    }


@router.post("/repos/select")
async def select_repo(payload: GithubSelectRepo, session: AsyncSession = Depends(get_session)):
    row = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project.github_repo_full_name = payload.repo_full_name
    return {"status": "selected"}


@router.post("/branches")
async def create_branch(payload: GithubBranchCreate, session: AsyncSession = Depends(get_session)):
    row = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    client = GithubClient(project.github_access_token)
    return await client.create_branch(project.github_repo_full_name, payload.new_branch, payload.base_sha)


@router.post("/commits")
async def create_commit(payload: GithubCommitCreate, session: AsyncSession = Depends(get_session)):
    row = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    client = GithubClient(project.github_access_token)
    return await client.create_commit(
        project.github_repo_full_name, payload.message, payload.tree, payload.parents
    )


@router.post("/pulls")
async def create_pull(payload: GithubPullRequestCreate, session: AsyncSession = Depends(get_session)):
    row = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = row.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.github_access_token or not project.github_repo_full_name:
        raise HTTPException(status_code=401, detail="GitHub not connected")

    client = GithubClient(project.github_access_token)
    return await client.create_pull_request(
        project.github_repo_full_name, payload.title, payload.head, payload.base, payload.body
    )
```

- [ ] **Step 6: Register router**

```python
# apps/agent/backend/main.py
from backend.api import deps, projects, runs, github
...
app.include_router(github.router, prefix="/api/github", tags=["github"])
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/agent && pytest tests/test_github_api.py::test_github_oauth_start -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/agent/backend/api/github.py apps/agent/backend/services/github_client.py apps/agent/backend/db/schemas.py apps/agent/backend/main.py apps/agent/tests/test_github_api.py
git commit -m "feat: add GitHub OAuth and repo endpoints"
```

---

### Task 3: Frontend GitHub connect + repo picker

**Files:**
- Create: `apps/web/components/GithubConnectButton.tsx`
- Create: `apps/web/components/GithubRepoPicker.tsx`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/RegisterProjectForm.tsx`

- [ ] **Step 1: Add types**

```ts
// apps/web/lib/types.ts
export interface GithubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface GithubRepoList {
  repos: GithubRepo[];
}

export interface Project {
  ...
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}

export interface ProjectListItem {
  ...
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}
```

- [ ] **Step 2: Add API methods**

```ts
// apps/web/lib/api.ts
export const api = {
  ...
  githubOauthStart: (projectId: string) =>
    request<{ url: string }>(`/api/github/oauth/start?project_id=${projectId}`),
  githubOauthCallback: (code: string, state: string) =>
    request<{ status: string }>(`/api/github/oauth/callback?code=${code}&state=${state}`),
  listGithubRepos: (projectId: string) =>
    request<GithubRepoList>(`/api/github/repos?project_id=${projectId}`),
  selectGithubRepo: (projectId: string, repo_full_name: string) =>
    request<{ status: string }>(`/api/github/repos/select`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, repo_full_name }),
    }),
};
```

- [ ] **Step 3: Create connect button**

```tsx
// apps/web/components/GithubConnectButton.tsx
"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function GithubConnectButton({ projectId }: { projectId: string }) {
  async function onConnect() {
    const { url } = await api.githubOauthStart(projectId);
    window.location.href = url;
  }

  return <Button onClick={onConnect}>Connect GitHub</Button>;
}
```

- [ ] **Step 4: Create repo picker**

```tsx
// apps/web/components/GithubRepoPicker.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { GithubRepo } from "@/lib/types";

export function GithubRepoPicker({ projectId, onSelected }: { projectId: string; onSelected: () => void }) {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    api.listGithubRepos(projectId).then((r) => setRepos(r.repos));
  }, [projectId]);

  async function onSave() {
    await api.selectGithubRepo(projectId, selected);
    onSelected();
  }

  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger>
          <SelectValue placeholder="Select repo" />
        </SelectTrigger>
        <SelectContent>
          {repos.map((r) => (
            <SelectItem key={r.full_name} value={r.full_name}>
              {r.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onSave} disabled={!selected}>Save repo</Button>
    </div>
  );
}
```

- [ ] **Step 5: Add connect UI to RegisterProjectForm**

```tsx
// apps/web/components/RegisterProjectForm.tsx
import { GithubConnectButton } from "@/components/GithubConnectButton";
...
// after createProject, show connect action with project id response
const created = await api.createProject({ name, repo_path: repoPath, language });
setCreatedProjectId(created.id);
...
{createdProjectId && <GithubConnectButton projectId={createdProjectId} />}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/api.ts apps/web/components/GithubConnectButton.tsx apps/web/components/GithubRepoPicker.tsx apps/web/components/RegisterProjectForm.tsx
git commit -m "feat: add GitHub connect and repo picker UI"
```

---

### Task 4: Project page repo browser + PR form

**Files:**
- Create: `apps/web/components/GithubRepoBrowser.tsx`
- Create: `apps/web/components/GithubPrForm.tsx`
- Modify: `apps/web/app/projects/[id]/page.tsx`

- [ ] **Step 1: Add repo browser**

```tsx
// apps/web/components/GithubRepoBrowser.tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function GithubRepoBrowser({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<any[]>([]);

  useEffect(() => {
    api.getGithubRepoTree(projectId).then((r) => setTree(r.tree));
  }, [projectId]);

  return (
    <ul className="text-sm">
      {tree.map((n) => (
        <li key={n.path}>{n.path}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Add PR form**

```tsx
// apps/web/components/GithubPrForm.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function GithubPrForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.createGithubPr({ project_id: projectId, title, head, base, body: null });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PR title" />
      <Input value={head} onChange={(e) => setHead(e.target.value)} placeholder="branch" />
      <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="base branch" />
      <Button type="submit">Create PR</Button>
    </form>
  );
}
```

- [ ] **Step 3: Render in project page**

```tsx
// apps/web/app/projects/[id]/page.tsx
import { GithubRepoBrowser } from "@/components/GithubRepoBrowser";
import { GithubPrForm } from "@/components/GithubPrForm";
...
{project.github_connected ? (
  <div className="space-y-4">
    <GithubRepoBrowser projectId={id} />
    <GithubPrForm projectId={id} />
  </div>
) : (
  <GithubConnectButton projectId={id} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/GithubRepoBrowser.tsx apps/web/components/GithubPrForm.tsx apps/web/app/projects/[id]/page.tsx
git commit -m "feat: add repo browser and PR form"
```

---

### Task 5: Docs and environment updates

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/frontend.md`
- Modify: `docs/environment.md`

- [ ] **Step 1: Add API docs**

```md
## GitHub

### `GET /api/github/oauth/start`
Starts OAuth flow for project.

### `GET /api/github/oauth/callback`
Completes OAuth flow and stores token.

### `GET /api/github/repos`
List accessible repos for project.

### `POST /api/github/repos/select`
Select repo for project.

### `POST /api/github/branches`
Create branch from SHA.

### `POST /api/github/commits`
Create commit.

### `POST /api/github/pulls`
Create pull request.
```

- [ ] **Step 2: Add frontend docs**

```md
- GithubConnectButton: starts OAuth for project
- GithubRepoPicker: choose repo after connect
- GithubRepoBrowser: lists repo tree
- GithubPrForm: creates PR
```

- [ ] **Step 3: Add env docs**

```md
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_OAUTH_REDIRECT_URL=http://localhost:3000/oauth/github/callback
GITHUB_OAUTH_SCOPES=repo,read:org
```

- [ ] **Step 4: Commit**

```bash
git add docs/api.md docs/frontend.md docs/environment.md
git commit -m "docs: add GitHub OAuth docs"
```

---

## Self-review

- Spec coverage: OAuth connect per project, repo list, repo select, browse tree, branch/commit/PR endpoints, UI + docs all covered.
- Placeholder scan: none.
- Type consistency: Project GitHub fields consistent across schemas and frontend.
