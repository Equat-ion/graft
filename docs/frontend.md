# Frontend Architecture

The web app is a Next.js 16 App Router project in `apps/web`. It uses Tailwind CSS v4, shadcn/ui components, Better Auth for authentication, and Drizzle ORM with a Neon (PostgreSQL) database.

## Structure

- `app/layout.tsx` — root layout with Geist fonts and Toaster
- `app/page.tsx` — public landing page
- `app/(app)/layout.tsx` — authenticated layout wrapper
- `app/(app)/dashboard/page.tsx` — authenticated dashboard
- `app/(app)/org/[slug]/page.tsx` — organisation overview
- `app/(app)/org/[slug]/projects/[projectId]/page.tsx` — project detail
- `app/(app)/org/[slug]/projects/new/page.tsx` — create project form
- `app/(app)/org/new/page.tsx` — create organisation form
- `app/auth/login/page.tsx` — sign-in page
- `app/auth/signup/page.tsx` — sign-up page
- `app/api/` — Next.js Route Handlers (auth, GitHub, webhooks, cron)
- `components/app-nav.tsx` — main navigation bar with org switcher
- `components/icons.tsx` — brand icons
- `components/ui/` — shadcn/ui primitives
- `lib/auth.ts` — Better Auth server config (GitHub OAuth, email/password, organisation plugin)
- `lib/auth-client.ts` — Better Auth React client
- `lib/db/` — Drizzle ORM setup (`index.ts`, `schema.ts`)
- `lib/agent-client.ts` — typed HTTP client for the FastAPI agent backend
- `lib/format.ts` — date/number formatting utilities
- `lib/sync/` — GitHub manifest sync helpers (`manifest.ts`, `github.ts`)
- `lib/utils.ts` — `cn()` helper for Tailwind class merging
- `proxy.ts` — auth guard (replaces deprecated `middleware.ts` in Next.js 16)

## Authentication

Better Auth with two providers:
- Email/password (`emailAndPassword: { enabled: true }`)
- GitHub OAuth (`socialProviders.github`)

Organisation plugin is enabled for multi-tenant support.

## Database

Neon PostgreSQL via `@neondatabase/serverless` + Drizzle ORM. Schema is managed with Drizzle Kit.

```
npm run db:push    # push schema changes
npm run db:studio  # Drizzle Studio
npm run db:generate # generate migrations
```

All commands require `.env.local` with `DATABASE_URL` (uses `dotenv-cli` to load the file).

### Lazy initialisation

The `db` singleton in `lib/db/index.ts` uses a **Proxy-based lazy initialisation** pattern:

```typescript
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb(); // creates neon() + drizzle() on first call
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
```

This defers the `neon(DATABASE_URL)` call to first property access (request time) rather than module-load time. This is critical because during `next build`, `DATABASE_URL` is not available — without lazy init, the build crashes with `Database connection string format for neon() should be: postgresql://...`.

All existing `import { db }` call-sites work unchanged since the Proxy transparently delegates to the real Drizzle instance.

## Agent API client

`lib/agent-client.ts` wraps all calls to the FastAPI backend. Base URL defaults to `http://localhost:8000` and is overridden via `NEXT_PUBLIC_AGENT_URL`. In production (HF Spaces), this points to `https://<space-url>/backend` since Nginx routes `/backend/*` to the FastAPI server.

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
| `NPM_HOOK_SECRET` | npm webhook HMAC signature secret (optional) |

## Local development

```
cd apps/web
npm install
npm run dev
```

The web app is **not** part of the root npm workspace (to avoid Turbopack module resolution issues with hoisted packages). Run `npm install` and `npm run dev` directly from `apps/web`.
