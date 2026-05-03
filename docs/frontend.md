# Frontend Architecture

The web app is a Next.js 16 App Router project in `apps/web`. It uses Tailwind CSS v4, shadcn/ui components, Better Auth for authentication, and Drizzle ORM with a Neon (PostgreSQL) database.

## Structure

- `app/layout.tsx` — root layout with Geist fonts and Toaster
- `app/page.tsx` — public landing page
- `app/(app)/dashboard/page.tsx` — authenticated dashboard
- `app/(app)/org/[slug]/page.tsx` — organisation overview
- `app/(app)/org/[slug]/projects/[projectId]/page.tsx` — project detail
- `app/(app)/org/[slug]/projects/new/page.tsx` — create project form
- `app/(app)/org/new/page.tsx` — create organisation form
- `app/auth/login/page.tsx` — sign-in page
- `app/auth/signup/page.tsx` — sign-up page
- `app/api/` — Next.js Route Handlers (auth, GitHub, webhooks, cron)
- `components/` — UI and navigation components
- `lib/auth.ts` — Better Auth server config (GitHub OAuth, email/password, organisation plugin)
- `lib/auth-client.ts` — Better Auth React client
- `lib/db/` — Drizzle ORM setup (`index.ts`, `schema.ts`)
- `lib/agent-client.ts` — typed HTTP client for the FastAPI agent backend
- `lib/sync/` — GitHub manifest sync helpers

## Authentication

Better Auth with two providers:
- Email/password (`emailAndPassword: { enabled: true }`)
- GitHub OAuth (`socialProviders.github`)

Organisation plugin is enabled for multi-tenant support.

## Database

Neon PostgreSQL via `@neondatabase/serverless`. Schema is managed with Drizzle Kit.

```
npm run db:push    # push schema changes
npm run db:studio  # Drizzle Studio
```

Both commands require `.env.local` with `DATABASE_URL`.

## Agent API client

`lib/agent-client.ts` wraps all calls to the FastAPI backend. Base URL defaults to `http://localhost:8000` and is overridden via `NEXT_PUBLIC_AGENT_URL`.

## Key API routes

| Route | Purpose |
|-------|---------|
| `/api/auth/[...all]` | Better Auth handler |
| `/api/github/callback` | GitHub App installation callback |
| `/api/github/repos` | List accessible repos for a GitHub installation |
| `/api/github/webhook` | GitHub App webhook events |
| `/api/webhooks/npm` | npm registry webhook (package publish events) |
| `/api/webhooks/agent` | Receive agent job completion callbacks |
| `/api/cron/pypi` | Cron trigger to poll PyPI for updates |
| `/api/projects` | List / create projects (proxies to agent backend) |

## Proxy (auth guard)

`proxy.ts` (replaces deprecated `middleware.ts` in Next.js 16) protects all routes except public paths and API handlers. Uses `getSessionCookie` from Better Auth for a lightweight edge check.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Auth secret |
| `BETTER_AUTH_URL` | App base URL (e.g. `http://localhost:3000`) |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_CLIENT_ID` | GitHub App OAuth client ID |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook signature secret |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | GitHub App slug for install URL |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_AGENT_URL` | FastAPI backend URL (default: `http://localhost:8000`) |

## Local development

```
cd apps/web
npm install
npm run dev
```

The web app is **not** part of the root npm workspace (to avoid Turbopack module resolution issues with hoisted packages). Run `npm install` and `npm run dev` directly from `apps/web`.
