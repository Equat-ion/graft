export type Language = "python" | "javascript" | "typescript" | "rust";
export type Ecosystem = "pypi" | "npm" | "crates";
export type RunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "tamper_detected";

export interface Dependency {
  id: string;
  project_id: string;
  name: string;
  current_version: string;
  target_version: string | null;
  ecosystem: Ecosystem;
  last_checked_at: string | null;
}

export interface Project {
  id: string;
  name: string;
  repo_path: string;
  language: Language;
  created_at: string;
  dependencies: Dependency[];
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}

export interface ProjectListItem {
  id: string;
  name: string;
  repo_path: string;
  language: Language;
  created_at: string;
  github_connected: boolean;
  github_username: string | null;
  github_repo_full_name: string | null;
}

export interface GithubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface GithubRepoList {
  repos: GithubRepo[];
}

export interface GithubTreeNode {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface GithubRepoTree {
  sha: string;
  tree: GithubTreeNode[];
  truncated: boolean;
}

export interface GithubPullRequestCreate {
  project_id: string;
  title: string;
  head: string;
  base: string;
  body: string | null;
}

export interface StepRecord {
  step_no: number;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
  duration_ms: number | null;
}

export interface AgentRun {
  id: string;
  project_id: string;
  dependency_id: string;
  status: RunStatus;
  steps: StepRecord[];
  reward: number | null;
  from_version: string | null;
  to_version: string | null;
  baseline_passed: number | null;
  baseline_failed: number | null;
  final_passed: number | null;
  final_failed: number | null;
  violation: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface AgentRunListItem {
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

export interface CheckResult {
  project_id: string;
  deps_checked: number;
  upgrades_found: number;
}
