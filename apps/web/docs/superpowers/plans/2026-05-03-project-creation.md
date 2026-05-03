# Project Creation and Manifest Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a streamlined project creation flow that links a GitHub repository to an organization and automatically syncs its dependencies.

**Architecture:** 
1.  **Frontend:** Update the "New Project" page to list repos from existing GitHub installations and allow connecting new ones.
2.  **API:** Create a POST `/api/projects` endpoint to handle project creation and trigger sync.
3.  **Sync Logic:** Implement a service to fetch repo contents, detect manifests (`package.json`, `requirements.txt`), and upsert dependencies with latest versions from registries.

**Tech Stack:** Next.js (App Router), Drizzle ORM, BetterAuth, Octokit (GitHub API), npm/PyPI Registry APIs.

---

### Task 1: GitHub Utility and Sync Logic

**Files:**
- Create: `lib/sync/github.ts`
- Create: `lib/sync/manifest.ts`

- [ ] **Step 1: Create GitHub utility for installation tokens**

```typescript
// lib/sync/github.ts
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export async function getInstallationOctokit(installationId: string) {
  const auth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, "base64").toString(),
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
  });

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY!, "base64").toString(),
      installationId: parseInt(installationId),
    },
  });
}
```

- [ ] **Step 2: Implement manifest sync skeleton**

```typescript
// lib/sync/manifest.ts
import { db } from "@/lib/db";
import { project as projectTable, dependency as dependencyTable, githubInstallation } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getInstallationOctokit } from "./github";

export async function syncProjectDependencies(projectId: string) {
  const [project] = await db.select().from(projectTable).where(eq(projectTable.id, projectId));
  if (!project || !project.githubInstallationId) return;

  const [installation] = await db.select().from(githubInstallation).where(eq(githubInstallation.id, project.githubInstallationId));
  if (!installation) return;

  const octokit = await getInstallationOctokit(installation.installationId);
  
  // 1. Fetch root tree
  const { data: tree } = await octokit.rest.git.getTree({
    owner: installation.accountLogin,
    repo: project.repoFullName.split("/")[1],
    tree_sha: project.defaultBranch || "main",
  });

  // 2. Detect manifests
  const manifests = tree.tree.filter(item => 
    item.path === "package.json" || item.path === "requirements.txt"
  );

  for (const manifest of manifests) {
    // Content fetching and parsing logic will go here
  }

  await db.update(projectTable).set({ lastSyncedAt: new Date() }).where(eq(projectTable.id, projectId));
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/sync/github.ts lib/sync/manifest.ts
git commit -m "feat: add github utility and sync logic skeleton"
```

---

### Task 2: Manifest Parsers and Registry Lookups

**Files:**
- Modify: `lib/sync/manifest.ts`

- [ ] **Step 1: Implement npm and PyPI parsers**

```typescript
// lib/sync/manifest.ts additions

async function fetchNpmLatest(name: string) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version;
  } catch { return null; }
}

async function fetchPyPiLatest(name: string) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${name}/json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.info.version;
  } catch { return null; }
}

// Inside syncProjectDependencies for loop:
// Fetch file content
const { data: fileData } = await octokit.rest.repos.getContent({
  owner: installation.accountLogin,
  repo: project.repoFullName.split("/")[1],
  path: manifest.path!,
  ref: project.defaultBranch || "main",
});

if ("content" in fileData) {
  const content = Buffer.from(fileData.content, "base64").toString();
  
  if (manifest.path === "package.json") {
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      const latest = await fetchNpmLatest(name);
      await db.insert(dependencyTable).values({
        projectId: project.id,
        name,
        ecosystem: "npm",
        currentVersion: (version as string).replace(/[\^~]/, ""),
        latestVersion: latest,
        manifestFile: "package.json",
        status: latest && latest !== (version as string).replace(/[\^~]/, "") ? "outdated" : "up-to-date",
      }).onConflictDoUpdate({
        target: [dependencyTable.projectId, dependencyTable.name, dependencyTable.manifestFile],
        set: { currentVersion: (version as string).replace(/[\^~]/, ""), latestVersion: latest }
      });
    }
  } else if (manifest.path === "requirements.txt") {
    const lines = content.split("\n");
    for (const line of lines) {
      const parts = line.split("==");
      if (parts.length === 2) {
        const name = parts[0].trim();
        const version = parts[1].trim();
        const latest = await fetchPyPiLatest(name);
        // similar insert logic for PyPI
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sync/manifest.ts
git commit -m "feat: implement manifest parsing and registry lookups"
```

---

### Task 3: Internal Projects API

**Files:**
- Create: `app/api/projects/route.ts`

- [ ] **Step 1: Implement POST /api/projects**

```typescript
// app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project as projectTable } from "@/lib/db/schema";
import { syncProjectDependencies } from "@/lib/sync/manifest";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json();
  const { name, organizationId, repoFullName, githubInstallationId } = body;

  const [project] = await db.insert(projectTable).values({
    name,
    organizationId,
    repoFullName,
    githubInstallationId,
  }).returning();

  // Trigger sync asynchronously
  syncProjectDependencies(project.id).catch(console.error);

  return NextResponse.json(project);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/projects/route.ts
git commit -m "feat: add internal projects api"
```

---

### Task 4: Frontend Refactoring

**Files:**
- Modify: `app/(app)/org/[slug]/projects/new/page.tsx`

- [ ] **Step 1: Update API calls to use internal routes**
- Replace `createAgentProject` with a fetch to `/api/projects`.
- Add a fetch to list repos from `github_installations` linked to the org.

- [ ] **Step 2: Commit**

```bash
git add app/(app)/org/[slug]/projects/new/page.tsx
git commit -m "feat: refactor frontend to use internal project creation flow"
```
