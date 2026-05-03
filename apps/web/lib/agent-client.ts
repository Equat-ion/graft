/**
 * Thin typed client for the Graft FastAPI agent.
 * Base URL is set via NEXT_PUBLIC_AGENT_URL env var (falls back to localhost:8000 for dev).
 */

const BASE = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Types (mirrored from the FastAPI Pydantic schemas) ────────────────────────

export type Ecosystem = "pypi" | "npm" | "crates";
export type RunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "tamper_detected";

export interface AgentDependency {
  id: string;
  project_id: string;
  name: string;
  current_version: string;
  target_version: string | null;
  ecosystem: Ecosystem;
  last_checked_at: string | null;
}

export interface AgentProject {
  id: string;
  name: string;
  repo_path: string;
  language: "python" | "javascript" | "typescript" | "rust";
  user_id: string;
  org_id: string | null;
  created_at: string;
  dependencies: AgentDependency[];
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}

export interface AgentProjectListItem {
  id: string;
  name: string;
  repo_path: string;
  language: string;
  user_id: string;
  org_id: string | null;
  created_at: string;
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}

export interface AgentRun {
  id: string;
  project_id: string;
  dependency_id: string;
  status: RunStatus;
  reward: number | null;
  from_version: string | null;
  to_version: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface AgentRunDetail extends AgentRun {
  steps: Record<string, unknown>[];
  baseline_passed: number | null;
  baseline_failed: number | null;
  final_passed: number | null;
  final_failed: number | null;
  violation: string | null;
}

export interface AgentOrganization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  projects: AgentProjectListItem[];
}

export interface CheckResult {
  project_id: string;
  deps_checked: number;
  upgrades_found: number;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function listAgentProjects(
  orgId?: string
): Promise<AgentProjectListItem[]> {
  const q = orgId ? `?org_id=${orgId}` : "";
  return apiFetch(`/api/projects${q}`);
}

export function getAgentProject(id: string): Promise<AgentProject> {
  return apiFetch(`/api/projects/${id}`);
}

export function createAgentProject(data: {
  name: string;
  repo_path: string;
  language: string;
  org_id?: string;
}): Promise<AgentProject> {
  return apiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteAgentProject(id: string): Promise<void> {
  return apiFetch(`/api/projects/${id}`, { method: "DELETE" });
}

// ── Dependencies ──────────────────────────────────────────────────────────────

export function listDeps(projectId: string): Promise<AgentDependency[]> {
  return apiFetch(`/api/deps/${projectId}`);
}

export function checkNow(projectId: string): Promise<CheckResult> {
  return apiFetch(`/api/deps/check-now/${projectId}`, { method: "POST" });
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function listRuns(
  projectId?: string,
  status?: RunStatus
): Promise<AgentRun[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  if (status) params.set("status", status);
  const q = params.toString() ? `?${params}` : "";
  return apiFetch(`/api/runs${q}`);
}

export function getRun(runId: string): Promise<AgentRunDetail> {
  return apiFetch(`/api/runs/${runId}`);
}

export function cancelRun(runId: string): Promise<AgentRunDetail> {
  return apiFetch(`/api/runs/${runId}/cancel`, { method: "POST" });
}

// ── Organisations ─────────────────────────────────────────────────────────────

export function listAgentOrgs(): Promise<AgentOrganization[]> {
  return apiFetch("/api/orgs");
}

export function getAgentOrg(slug: string): Promise<AgentOrganization> {
  return apiFetch(`/api/orgs/${slug}`);
}

export function createAgentOrg(data: {
  name: string;
  slug?: string;
}): Promise<AgentOrganization> {
  return apiFetch("/api/orgs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export function getGithubOAuthUrl(
  projectId: string
): Promise<{ url: string }> {
  return apiFetch(`/api/github/oauth/start?project_id=${projectId}`);
}

export function listGithubRepos(
  projectId: string
): Promise<{ repos: { full_name: string; default_branch: string; private: boolean }[] }> {
  return apiFetch(`/api/github/repos?project_id=${projectId}`);
}

export function selectGithubRepo(
  projectId: string,
  repoFullName: string
): Promise<{ status: string }> {
  return apiFetch("/api/github/repos/select", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, repo_full_name: repoFullName }),
  });
}

// ── Health ────────────────────────────────────────────────────────────────────

export function checkAgentHealth(): Promise<{
  status: string;
  llm_model: string;
  llm_base_url: string;
}> {
  return apiFetch("/health");
}
