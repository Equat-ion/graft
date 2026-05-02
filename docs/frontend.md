# Frontend Architecture

The web app is a Next.js 15 app router project in apps/web. It uses Tailwind CSS and shadcn/ui components.

## Structure

- app/layout.tsx: global layout and navigation
- app/page.tsx: dashboard
- app/projects/[id]/page.tsx: project detail view
- app/runs/[id]/page.tsx: run detail view
- components/: UI and feature components
- lib/api.ts: typed API client
- lib/types.ts: shared types

## Data flow

All data fetches use SWR with a shared fetcher. The base API URL comes from NEXT_PUBLIC_API_URL.

Polling behavior:

- Dashboard run list refreshes every 5 seconds.
- Project run list refreshes every 5 seconds.
- Run detail refreshes every 2 seconds only while status is running.

## Key components

- RegisterProjectForm: registers a repo and triggers SWR revalidation.
- StepTrace: renders tool steps and shows args and results.
- RewardScore: colors reward values by threshold.
- GithubConnectButton: starts OAuth for a specific project.
- GithubRepoPicker: loads accessible repos and stores selected repo on project.
- GithubRepoBrowser: shows the selected repository tree.
- GithubPrForm: creates pull requests through backend GitHub endpoints.

## GitHub OAuth flow

- User clicks `GithubConnectButton` from project registration or project detail page.
- Frontend calls `GET /api/github/oauth/start` and redirects browser to GitHub authorize URL.
- GitHub redirects back to `/oauth/github/callback` with `code` and `state`.
- Callback page calls `GET /api/github/oauth/callback`, then redirects to `/projects/{state}`.
- Connected projects can pick a repository and use repo browser and PR form UI.

## UI conventions

- Primary layout is a header plus container content.
- Status and version badges provide compact run metadata.
- Tables are used for projects, dependencies, and run lists.

## Local development

```
cd apps/web
npm install
npm run dev
```
