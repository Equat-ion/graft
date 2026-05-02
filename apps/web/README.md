# Graft web (`apps/web`)

Next.js 15 + Tailwind + shadcn/ui dashboard.

## Pages

- `/` — projects, recent runs, summary cards (auto-refresh).
- `/projects/[id]` — project metadata, dependency table, run history.
- `/runs/[id]` — step-by-step trace of a single agent run, polling every 2s while running.

## Run

```
npm install
npm run dev   # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`.
