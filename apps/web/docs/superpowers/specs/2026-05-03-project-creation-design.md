# Design Doc: Project Creation and Manifest Sync

**Status:** Draft
**Topic:** Project Creation Flow
**Date:** 2026-05-03

---

## 1. Objective
Implement a streamlined project creation flow in Graft that allows users to link a GitHub repository to an organization and automatically sync its dependencies (npm and PyPI).

## 2. Architecture

### 2.1 Data Model
We will use the existing tables in `lib/db/schema.ts`:
- `organization`: The owner of the project.
- `github_installations`: Stores GitHub App installation IDs linked to organizations.
- `projects_graft`: Stores project metadata and links to a specific repo and installation.
- `dependencies_graft`: Stores the list of dependencies found in the repo.

### 2.2 Components

#### Frontend: `app/(app)/org/[slug]/projects/new/page.tsx`
- Refactor to support the internal Graft flow.
- **State 1: Details** - User enters project name.
- **State 2: Repo Selection** - List repos from all `github_installations` linked to the organization.
- **Action: Connect GitHub** - Button to trigger GitHub App installation if no installations exist or a new one is needed.

#### Backend: `api/projects` (New POST route)
- **Input:** `name`, `organizationId`, `repoFullName`, `githubInstallationId`.
- **Logic:**
    1. Create entry in `projects_graft`.
    2. Trigger an asynchronous sync process.

#### Sync Logic: `lib/sync/manifest.ts` (New file)
- **Function:** `syncProjectDependencies(projectId: string)`
- **Steps:**
    1. Get project and GitHub installation details.
    2. Generate an installation token.
    3. Fetch repo root file tree using GitHub API.
    4. Detect manifest files: `package.json`, `requirements.txt`.
    5. Parse manifests to extract name, ecosystem, and current version.
    6. For each dependency:
        - Query registry (npm/PyPI) for latest version.
        - Upsert into `dependencies_graft`.
    7. Update `projects_graft.lastSyncedAt`.

## 3. Implementation Details

### 3.1 GitHub Integration
- Use `@octokit/auth-app` to generate installation tokens.
- Use the installation ID stored in `github_installations`.

### 3.2 Manifest Parsing
- **npm:** Parse `package.json`. Track `dependencies` and `devDependencies`.
- **PyPI:** Parse `requirements.txt`. Simple line-by-line parsing for `==` pins.

### 3.3 Registry Lookups
- **npm:** `https://registry.npmjs.org/<package>/latest`
- **PyPI:** `https://pypi.org/pypi/<package>/json`

## 4. Error Handling
- Handle missing manifest files gracefully (project created but 0 dependencies).
- Handle GitHub API rate limits or permission issues.
- Provide feedback to the user if the sync fails.

## 5. Success Criteria
- User can create a project and select a repo from their GitHub installation.
- After creation, the user is redirected to the project dashboard.
- The project dashboard shows a populated list of dependencies with their current and latest versions.
