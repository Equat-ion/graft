# API Reference

> Full REST API reference for the Graft backend.

**Base URL (local):** `http://localhost:8000`
**Base URL (production):** `https://<user>-graft-backend.hf.space/backend`
**Interactive docs:** `http://localhost:8000/docs` (Swagger UI)

> [!NOTE]
> In production, Nginx on port 7860 routes `/backend/*` to the FastAPI server. The Next.js frontend handles all other paths.

---

## Health

### `GET /health`

Health check endpoint.

**Response** `200`
```json
{
  "status": "ok",
  "llm_model": "graft-agent",
  "llm_base_url": "http://localhost:8001/v1"
}
```

---

## Projects

### `GET /api/projects`

List all registered projects, newest first.

**Response** `200`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "my-app",
    "repo_path": "/home/user/repos/my-app",
    "language": "python",
    "created_at": "2026-05-01T12:00:00Z"
  }
]
```

### `POST /api/projects`

Register a new project for Graft to watch.

**Request body**
```json
{
  "name": "my-app",
  "repo_path": "/home/user/repos/my-app",
  "language": "python"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (1–255) | ✅ | Display name |
| `repo_path` | string (1–2048) | ✅ | Absolute path to the local clone |
| `language` | enum | ✅ | `python`, `javascript`, `typescript`, or `rust` |

**Validation**: `repo_path` must exist on disk and be a directory.

**Response** `201`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-app",
  "repo_path": "/home/user/repos/my-app",
  "language": "python",
  "created_at": "2026-05-01T12:00:00Z",
  "dependencies": []
}
```

### `GET /api/projects/{project_id}`

Get a project with its dependencies eagerly loaded.

**Response** `200`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-app",
  "repo_path": "/home/user/repos/my-app",
  "language": "python",
  "created_at": "2026-05-01T12:00:00Z",
  "dependencies": [
    {
      "id": "...",
      "project_id": "...",
      "name": "requests",
      "current_version": "2.31.0",
      "target_version": "2.32.0",
      "ecosystem": "pypi",
      "last_checked_at": "2026-05-01T12:15:00Z"
    }
  ]
}
```

**Error** `404` — Project not found

### `DELETE /api/projects/{project_id}`

Delete a project and cascade-delete all its dependencies and runs.

**Response** `204` — No content

**Error** `404` — Project not found

---

## Runs

### `GET /api/runs`

List agent runs with optional filters.

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | uuid | — | Filter by project |
| `status` | enum | — | `pending`, `running`, `success`, `failed`, `tamper_detected` |
| `limit` | int (1–500) | 100 | Maximum results |

**Response** `200`
```json
[
  {
    "id": "...",
    "project_id": "...",
    "dependency_id": "...",
    "status": "success",
    "reward": 0.87,
    "from_version": "2.31.0",
    "to_version": "2.32.0",
    "started_at": "2026-05-01T12:30:00Z",
    "finished_at": "2026-05-01T12:32:15Z"
  }
]
```

### `GET /api/runs/{run_id}`

Get full run detail including step trace.

**Response** `200`
```json
{
  "id": "...",
  "project_id": "...",
  "dependency_id": "...",
  "status": "success",
  "steps": [
    {
      "step_no": 1,
      "tool": "read_changelog",
      "args": {"dep": "requests", "from_version": "2.31.0", "to_version": "2.32.0"},
      "result": "## v2.32.0\n- Added HTTP/2 support...",
      "timestamp": "2026-05-01T12:30:05Z",
      "duration_ms": 1200
    },
    {
      "step_no": 2,
      "tool": "grep_repo",
      "args": {"pattern": "requests\\.get", "file_glob": "**/*.py"},
      "result": "[{\"file\": \"src/client.py\", \"line_no\": 42, \"snippet\": \"...\"}]",
      "timestamp": "2026-05-01T12:30:07Z",
      "duration_ms": 85
    }
  ],
  "reward": 0.87,
  "from_version": "2.31.0",
  "to_version": "2.32.0",
  "baseline_passed": 42,
  "baseline_failed": 0,
  "final_passed": 42,
  "final_failed": 0,
  "violation": null,
  "started_at": "2026-05-01T12:30:00Z",
  "finished_at": "2026-05-01T12:32:15Z"
}
```

**Error** `404` — Run not found

### `POST /api/runs/{run_id}/cancel`

Cancel a pending or running agent run.

**Precondition**: Run status must be `pending` or `running`.

**Response** `200` — The updated run object (status set to `failed`, violation set to `cancelled_by_user`)

**Error** `404` — Run not found
**Error** `409` — Run is not in a cancellable state

---

## Dependencies

### `GET /api/deps/{project_id}`

List all tracked dependencies for a project, ordered by name.

**Response** `200`
```json
[
  {
    "id": "...",
    "project_id": "...",
    "name": "requests",
    "current_version": "2.31.0",
    "target_version": "2.32.0",
    "ecosystem": "pypi",
    "last_checked_at": "2026-05-01T12:15:00Z"
  }
]
```

**Error** `404` — Project not found

### `POST /api/deps/check-now/{project_id}`

Trigger an immediate dependency check for a project. This polls the relevant package registries for all of the project's tracked dependencies.

If a newer version is found, it creates a pending `AgentRun` automatically (unless one already exists for that dependency).

**Response** `200`
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "deps_checked": 5,
  "upgrades_found": 1
}
```

**Error** `404` — Project not found

---

## GitHub

### `GET /api/github/oauth/start`

Starts the GitHub OAuth flow for a project.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `project_id` | uuid | ✅ | Project that should receive the OAuth token |

**Response** `200`
```json
{
  "url": "https://github.com/login/oauth/authorize?..."
}
```

### `GET /api/github/oauth/callback`

Completes OAuth and stores the access token on the project.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `code` | string | ✅ | OAuth authorization code from GitHub |
| `state` | uuid | ✅ | Project ID from the start step |

**Response** `200`
```json
{
  "status": "connected"
}
```

### `GET /api/github/repos`

Lists repositories available to the connected GitHub account.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `project_id` | uuid | ✅ | Project with stored OAuth token |

### `POST /api/github/repos/select`

Sets the selected repository for a project.

**Request body**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "repo_full_name": "octocat/hello-world"
}
```

### `GET /api/github/repo/tree`

Returns repository tree entries for the selected repository.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `project_id` | uuid | ✅ | Project with selected repository |
| `ref` | string | ❌ | Branch, tag, or SHA (`HEAD` by default) |

### `GET /api/github/repo/file`

Returns metadata/content payload for a file in the selected repository.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `project_id` | uuid | ✅ | Project with selected repository |
| `path` | string | ✅ | Path relative to repository root |
| `ref` | string | ❌ | Branch, tag, or SHA (`HEAD` by default) |

### `POST /api/github/branches`

Creates a branch ref from a base SHA.

### `POST /api/github/commits`

Creates a commit object for the selected repository.

### `POST /api/github/pulls`

Creates a pull request for the selected repository.

---

## Agent

### `POST /api/agent/github-trigger`

Enqueues a GitHub-based upgrade run. Called by the Next.js frontend when the user clicks **Upgrade** on an outdated dependency.

**Request body**
```json
{
  "job_id": "frontend-update-job-uuid",
  "project_id": "frontend-project-uuid",
  "project_name": "my-app",
  "repo_full_name": "octocat/my-app",
  "default_branch": "main",
  "installation_id": "12345678",
  "dep_name": "requests",
  "dep_ecosystem": "pypi",
  "from_version": "2.28.0",
  "to_version": "2.32.3",
  "user_id": "user-id",
  "webhook_url": "https://app.example.com/api/webhooks/agent"
}
```

**Response** `200`
```json
{
  "run_id": "agent-run-uuid",
  "project_id": "frontend-project-uuid",
  "job_id": "frontend-update-job-uuid"
}
```

**Error** `409` — Upgrade run already queued or running for this dependency

---

## Sandbox

### `POST /api/sandbox/run-tests`

Run tests in the sandbox for a given project.

### `GET /api/sandbox/status`

Get sandbox status and availability.

---

## Inference

### `POST /api/inference/chat`

Send a chat completion request to the LLM backend (proxied through the agent).

### `GET /api/inference/model`

Get information about the currently loaded model.

---

## Enums

### Language
```
python | javascript | typescript | rust
```

### Ecosystem
```
pypi | npm | crates
```

### RunStatus
```
pending | running | success | failed | tamper_detected
```

---

## Error format

All errors return a JSON body:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request (e.g. repo_path doesn't exist) |
| 404 | Resource not found |
| 409 | Conflict (e.g. cancelling a completed run) |
| 422 | Validation error (Pydantic) |
| 500 | Internal server error |

---

## Real-time updates

The frontend polls `GET /api/runs/{id}` every 2 seconds while a run has `status === "running"` to get live step trace updates. The `steps` array grows as the agent executes tool calls.

There is no WebSocket endpoint — polling is sufficient given the step cadence (each tool call takes 0.5–10 seconds).

---

## CORS

The backend reads `CORS_ORIGINS` (comma-separated) and configures `CORSMiddleware` with `allow_credentials=True`. Default origins: `http://localhost:3000,http://localhost:3001`. In production, set this to the Vercel/HF Spaces URL.
