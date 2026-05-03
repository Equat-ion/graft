# Graft — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-05-03

---

## 1. Overview

### 1.1 Product Summary

Graft is a dependency lifecycle management platform. It connects to a team's GitHub repositories, reads their dependency manifests, tracks every dependency's version in real time via npm webhooks and PyPI RSS feeds, and — when an outdated dependency is detected — dispatches a job to a separately hosted AI agent that clones the repo in a sandboxed Docker container, applies the upgrade, runs tests, and opens a pull request automatically.

### 1.2 Problem Statement

Teams routinely run on outdated dependencies because keeping them current is tedious, risky, and low-priority until something breaks. Existing tools (Dependabot, Renovate) create PRs but do not understand changelogs, cannot reason about breaking changes, and cannot fix the code to accommodate them. Graft closes this gap by delegating the actual migration work to an AI agent while giving teams full visibility into their dependency health in one dashboard.

### 1.3 Goals

- Give teams a single place to see the version health of every dependency across all their projects.
- Trigger dependency updates automatically via real-time ecosystem signals (npm webhooks, PyPI RSS).
- Dispatch upgrade jobs to the AI agent and surface the resulting PR back in the dashboard.
- Keep the platform multi-tenant from day one: one login can belong to multiple organisations.

### 1.4 Non-Goals

- Graft does not build the AI agent — that is a separate service with a defined API contract.
- Graft does not support ecosystems beyond npm and PyPI in v1.
- Graft does not self-host Git providers — only GitHub is supported in v1.

---

## 2. Users & Personas

| Persona | Description |
|---|---|
| **Org Admin** | Creates the organisation, connects GitHub, manages members and projects. |
| **Developer** | Views dependency dashboards for projects they are a member of, reviews PRs created by the agent. |

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend & Backend | Next.js 14 (App Router) | Single deployment, API routes handle all server logic, RSC for fast dashboards |
| Database | Neon (serverless Postgres) | Scales to zero, branching for dev/staging, no connection pool overhead |
| ORM | Drizzle | Type-safe, SQL-first, pairs cleanly with Neon |
| Auth | BetterAuth | Built-in organisation/member support, sessions, email magic links |
| Email | Resend | Transactional emails, simple SDK |
| Background / Cron | Vercel Cron Jobs | Drives the PyPI RSS poller; serverless, no extra infra |
| GitHub Integration | GitHub App | Installation-based repo access, can push PRs as the app identity |
| Agent | FastAPI (external) | Separate service; Graft only calls its HTTP API |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                   Next.js Frontend (RSC)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Next.js API Routes                         │
│                                                             │
│  /api/auth/**          BetterAuth handlers                  │
│  /api/github/**        GitHub App OAuth + webhooks          │
│  /api/webhooks/npm     npm registry webhook receiver        │
│  /api/webhooks/pypi    PyPI RSS cron processor              │
│  /api/webhooks/agent   Agent job callback receiver          │
│  /api/projects/**      CRUD for projects & dependencies     │
└──────┬──────────────────────────┬───────────────────────────┘
       │                          │
┌──────▼──────┐          ┌────────▼────────┐
│  Neon DB    │          │  FastAPI Agent  │
│  (Drizzle)  │          │  (external)     │
└─────────────┘          └─────────────────┘
       ▲
       │
┌──────┴──────────────────────────────────┐
│  External Signals                       │
│  - npm registry webhooks                │
│  - PyPI RSS feed (Vercel Cron, 10 min)  │
│  - GitHub App webhooks                  │
└─────────────────────────────────────────┘
```

---

## 5. Database Schema

### 5.1 Core Tables

```sql
-- Managed by BetterAuth (do not hand-write)
users (id, email, name, created_at)
sessions (id, user_id, expires_at, ...)
organisations (id, name, slug, created_at)
members (id, user_id, organisation_id, role)

-- Graft domain tables

github_installations (
  id              uuid PRIMARY KEY,
  organisation_id uuid REFERENCES organisations(id),
  installation_id bigint UNIQUE NOT NULL,   -- GitHub App installation ID
  account_login   text NOT NULL,            -- GitHub org or user login
  created_at      timestamptz DEFAULT now()
)

projects (
  id                    uuid PRIMARY KEY,
  organisation_id       uuid REFERENCES organisations(id),
  github_installation_id uuid REFERENCES github_installations(id),
  repo_full_name        text NOT NULL,       -- e.g. "acme/backend"
  name                  text NOT NULL,
  default_branch        text DEFAULT 'main',
  last_synced_at        timestamptz,
  created_at            timestamptz DEFAULT now()
)

dependencies (
  id              uuid PRIMARY KEY,
  project_id      uuid REFERENCES projects(id),
  name            text NOT NULL,
  ecosystem       text NOT NULL CHECK (ecosystem IN ('npm', 'pypi')),
  current_version text NOT NULL,
  latest_version  text,
  status          text NOT NULL DEFAULT 'up-to-date'
                  CHECK (status IN ('up-to-date', 'outdated', 'pr-open', 'failed', 'ignored')),
  manifest_file   text NOT NULL,            -- e.g. "package.json"
  last_checked_at timestamptz,
  updated_at      timestamptz DEFAULT now()
)

update_jobs (
  id              uuid PRIMARY KEY,
  dependency_id   uuid REFERENCES dependencies(id),
  agent_job_id    text,                     -- ID returned by agent POST /jobs
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'pr-open', 'failed', 'cancelled')),
  pr_url          text,
  pr_number       int,
  agent_logs      text,
  triggered_at    timestamptz DEFAULT now(),
  completed_at    timestamptz
)
```

---

## 6. Feature Specifications

### 6.1 Authentication & Organisations

**Implementation:** BetterAuth with email + password and magic link.

**Flows:**
- Sign up → auto-creates a personal session.
- Create Organisation → BetterAuth `organisation` plugin; user becomes `owner`.
- Invite member → BetterAuth sends invitation email via Resend → invitee clicks link → joins org with `member` role.
- Roles: `owner`, `admin`, `member`. Only `owner`/`admin` can connect GitHub or delete projects.

**Pages:**
- `/auth/login`
- `/auth/signup`
- `/auth/verify` (magic link landing)
- `/org/new` (create organisation)
- `/settings/members` (invite + manage members)

---

### 6.2 GitHub App Setup

**One-time (developer task, not user-facing):**

1. Go to GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App.
2. Set:
   - **Homepage URL:** your domain
   - **Callback URL:** `https://yourdomain.com/api/github/callback`
   - **Webhook URL:** `https://yourdomain.com/api/github/webhook`
   - **Permissions:**
     - Repository: Contents (read), Pull Requests (write), Workflows (read)
     - Metadata (read-only) — mandatory
3. Generate a private key and store as `GITHUB_APP_PRIVATE_KEY` env var (PEM, base64-encoded).
4. Note `GITHUB_APP_ID` and `GITHUB_APP_CLIENT_ID`.
5. Set `GITHUB_WEBHOOK_SECRET` for webhook signature verification.

**User-facing installation flow:**
- User clicks "Connect GitHub" inside a project → redirected to GitHub App installation page.
- GitHub redirects back to `/api/github/callback?installation_id=xxx&setup_action=install`.
- API route stores `installation_id` in `github_installations` linked to the org.

---

### 6.3 Project Creation & Manifest Sync

**Create Project flow:**
1. User names the project and selects a repo from their connected GitHub installation.
2. Graft calls GitHub Contents API using an installation token (generated from the App private key) to fetch the repo's root file tree.
3. Detect manifest files: `package.json`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `poetry.lock`, `pnpm-lock.yaml`, `yarn.lock`.
4. Parse each manifest to extract dependency names + pinned versions.
5. For each dependency, call the relevant registry to fetch `latest_version`.
6. Insert rows into `dependencies`. Set `status = 'outdated'` where `current_version != latest_version`.

**Generating a GitHub Installation Token:**
```typescript
import { createAppAuth } from "@octokit/auth-app";

const auth = createAppAuth({
  appId: process.env.GITHUB_APP_ID,
  privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY, "base64").toString(),
});

const { token } = await auth({
  type: "installation",
  installationId: installation.installationId,
});
```

**Manifest Parsers (server-side, no external lib needed):**

| File | Parse strategy |
|---|---|
| `package.json` | `JSON.parse` → `dependencies` + `devDependencies` |
| `requirements.txt` | Line-by-line, split on `==`, `>=`, `~=` |
| `pyproject.toml` | Use `@iarna/toml` npm package → `project.dependencies` or `tool.poetry.dependencies` |
| `Pipfile` | TOML parse → `[packages]` and `[dev-packages]` |

---

### 6.4 Dependency Dashboard

**Route:** `/org/[orgSlug]/projects/[projectId]`

**UI Components:**

- **Summary bar:** total deps, up-to-date count, outdated count, PRs open count.
- **Dependency table:**

| Column | Description |
|---|---|
| Name | Package name, links to npm/PyPI page |
| Ecosystem | Badge: `npm` (red) or `PyPI` (blue) |
| Current Version | From manifest |
| Latest Version | From registry |
| Status | `✅ Up to date` / `⚠️ Outdated` / `🔄 PR Open` / `❌ Failed` / `⏸ Ignored` |
| PR | Link to GitHub PR if `pr-open` |
| Actions | "Trigger Update" button (manual), "Ignore" button |

- **Dependency detail drawer:** click a row → slide-out showing manifest file it came from, changelog link, all past `update_jobs` for that dep with status and PR links.

---

### 6.5 Webhook Ingestion — npm

**npm Webhook Setup (one-time per package on first import):**

npm supports registry hooks via their API. When a dependency is first added to Graft:

```bash
npm hook add <package-name> https://yourdomain.com/api/webhooks/npm <secret>
```

This can be automated via the npm Hooks API in your project creation flow.

**Receiver — `/api/webhooks/npm` (POST):**

```typescript
// 1. Verify HMAC-SHA256 signature from X-npm-signature header
// 2. Extract package name + new version from payload
// 3. Find all dependencies in DB matching this package name + ecosystem = 'npm'
// 4. Update latest_version, set status = 'outdated' if current != latest
// 5. Dispatch agent job for each outdated dependency
```

---

### 6.6 Webhook Ingestion — PyPI

PyPI does not support push webhooks. Instead, Graft polls the PyPI RSS feed on a 10-minute Vercel Cron.

**Cron route — `/api/cron/pypi` (GET, secured with `CRON_SECRET`):**

```typescript
// 1. Fetch https://pypi.org/rss/updates.xml
// 2. Parse XML — each <item> has <title> like "package-name 1.2.3"
// 3. For each item published in the last 15 minutes:
//    a. Check if any dependency in DB matches this package name + ecosystem = 'pypi'
//    b. Update latest_version, set status = 'outdated' if needed
//    c. Dispatch agent job
```

**Vercel Cron config in `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/pypi",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

---

### 6.7 Agent Job Dispatch

When a dependency is marked `outdated`, Graft dispatches a job to the agent.

**Outgoing payload — `POST <AGENT_URL>/jobs`:**

```typescript
{
  "job_id": "<uuid>",                         // Graft-generated, for callback correlation
  "callback_url": "https://yourdomain.com/api/webhooks/agent",
  "github": {
    "installation_id": 12345678,
    "repo_full_name": "acme/backend",
    "default_branch": "main"
  },
  "dependencies": [
    {
      "name": "fastapi",
      "ecosystem": "pypi",
      "from_version": "0.100.0",
      "to_version": "0.115.0",
      "manifest_file": "requirements.txt"
    }
  ]
}
```

**After dispatch:**
- Insert a row into `update_jobs` with `status = 'queued'`, store `agent_job_id` from the agent's response.
- Set `dependencies.status = 'pr-open'` (optimistic) or wait for callback.

---

### 6.8 Agent Callback

**Receiver — `/api/webhooks/agent` (POST):**

Verify using a shared `AGENT_WEBHOOK_SECRET` header.

```typescript
{
  "job_id": "<uuid>",          // the Graft job_id sent in the dispatch
  "status": "pr-open",         // "pr-open" | "failed"
  "pr_url": "https://github.com/acme/backend/pull/42",
  "pr_number": 42,
  "logs": "..."
}
```

**Handler:**
1. Look up `update_jobs` by `job_id`.
2. Update `status`, `pr_url`, `pr_number`, `completed_at`.
3. Update linked `dependency.status` to `'pr-open'` or `'failed'`.
4. Send in-app notification + email to org members.

---

### 6.9 Notifications

**In-app:** A notification bell in the nav. Notifications table:

```sql
notifications (
  id              uuid PRIMARY KEY,
  organisation_id uuid,
  user_id         uuid,           -- null = all org members
  title           text,
  body            text,
  link            text,
  read            boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
)
```

Events that trigger notifications:
- PR opened by agent → "FastAPI upgraded to 0.115.0 — PR #42 is open"
- Agent job failed → "Upgrade of fastapi failed — check logs"

**Email:** Sent via Resend to all org `admin`/`owner` members. Simple transactional template.

---

## 7. API Routes Summary

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/**` | BetterAuth — all auth flows |
| GET | `/api/github/callback` | GitHub App install callback |
| POST | `/api/github/webhook` | GitHub App event receiver |
| POST | `/api/projects` | Create project + trigger manifest sync |
| GET | `/api/projects/[id]/dependencies` | List all deps for a project |
| POST | `/api/projects/[id]/sync` | Re-sync manifests on demand |
| POST | `/api/dependencies/[id]/trigger` | Manually trigger an agent job |
| PATCH | `/api/dependencies/[id]/ignore` | Set status to `ignored` |
| POST | `/api/webhooks/npm` | npm hook receiver |
| GET | `/api/cron/pypi` | PyPI RSS poller (Vercel Cron) |
| POST | `/api/webhooks/agent` | Agent job callback receiver |

---

## 8. Environment Variables

```env
# Neon
DATABASE_URL=

# BetterAuth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=         # base64-encoded PEM
GITHUB_WEBHOOK_SECRET=

# npm Hooks
NPM_HOOK_SECRET=
NPM_TOKEN=                      # Needs publish scope to register hooks

# Agent
AGENT_URL=                      # e.g. https://agent.yourdomain.com
AGENT_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=

# Vercel Cron
CRON_SECRET=
```

---

## 9. Page Map

```
/                             Landing / marketing
/auth/login                   Login
/auth/signup                  Sign up
/auth/verify                  Magic link landing

/org/new                      Create organisation

/dashboard                    Org switcher + project list
/org/[orgSlug]/projects/new   Create project (pick repo, trigger sync)
/org/[orgSlug]/projects/[id]  Dependency dashboard for a project
/org/[orgSlug]/settings       Org settings
/settings/members             Member management
/settings/github              GitHub installation management

/api/**                       (see Section 7)
```

---

## 10. Agent Contract (Summary)

The agent is a separate FastAPI service. Graft only needs these two interactions to be stable:

**Graft → Agent:**
- `POST /jobs` — accepts the job payload (Section 6.7), returns `{ "job_id": "<agent-internal-id>" }`

**Agent → Graft:**
- `POST <callback_url>` — sends job result (Section 6.8)

Everything inside the agent (Docker, sandboxing, git clone, test runner, PR creation) is out of scope for this PRD.

---

## 11. Build Order (Recommended)

1. **Infra bootstrap** — Neon DB, Drizzle schema, BetterAuth config, deploy skeleton Next.js app to Vercel.
2. **Auth + Orgs** — login, signup, create org, invite members.
3. **GitHub App** — register app, implement install flow, store `installation_id`.
4. **Project creation + manifest sync** — repo picker, manifest parser, registry lookup, seed `dependencies` table.
5. **Dependency dashboard** — read-only table UI, status badges.
6. **npm webhook ingestion** — register hooks, implement receiver, update DB.
7. **PyPI cron poller** — implement RSS parser, Vercel Cron setup.
8. **Agent dispatch + callback** — job creation, callback receiver, status updates.
9. **Notifications** — in-app bell + Resend emails.
10. **Polish** — manual trigger, ignore, re-sync, error states, empty states.

---

## 12. Open Questions

| # | Question | Default assumption |
|---|---|---|
| 1 | Should `devDependencies` in `package.json` be tracked? | Yes, but shown with a `dev` badge |
| 2 | Should multiple outdated deps for the same repo be batched into one agent job? | Yes — batch per project per trigger event |
| 3 | What happens if a PR is merged/closed on GitHub? | GitHub webhook fires; update job + dep status accordingly |
| 4 | Is there a rate limit strategy for the npm hook registration calls? | Register hooks async on project creation, retry with backoff |
| 5 | Should users be able to set auto-update rules (e.g. only patch bumps)? | Out of scope for v1 |