import type {
  AgentRun,
  AgentRunListItem,
  CheckResult,
  Dependency,
  Language,
  Project,
  ProjectListItem,
  RunStatus,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listProjects: () => request<ProjectListItem[]>("/api/projects"),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (input: { name: string; repo_path: string; language: Language }) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  listRuns: (params: { project_id?: string; status?: RunStatus; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.project_id) q.set("project_id", params.project_id);
    if (params.status) q.set("status", params.status);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<AgentRunListItem[]>(`/api/runs${qs ? `?${qs}` : ""}`);
  },
  getRun: (id: string) => request<AgentRun>(`/api/runs/${id}`),
  cancelRun: (id: string) =>
    request<AgentRun>(`/api/runs/${id}/cancel`, { method: "POST" }),

  listDeps: (projectId: string) =>
    request<Dependency[]>(`/api/deps/${projectId}`),
  checkNow: (projectId: string) =>
    request<CheckResult>(`/api/deps/check-now/${projectId}`, { method: "POST" }),
};

export const fetcher = <T>(path: string) => request<T>(path);
