"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { GithubConnectButton } from "@/components/GithubConnectButton";
import { GithubPrForm } from "@/components/GithubPrForm";
import { GithubRepoBrowser } from "@/components/GithubRepoBrowser";
import { GithubRepoPicker } from "@/components/GithubRepoPicker";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRunListItem, Project } from "@/lib/types";

const LANG_COLOR: Record<string, string> = {
  python: "bg-blue-500/20 text-blue-300",
  javascript: "bg-yellow-500/20 text-yellow-300",
  typescript: "bg-sky-500/20 text-sky-300",
  rust: "bg-orange-500/20 text-orange-300",
};

const ECO_COLOR: Record<string, string> = {
  pypi: "bg-blue-500/20 text-blue-300",
  npm: "bg-red-500/20 text-red-300",
  crates: "bg-orange-500/20 text-orange-300",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { data: project, error: projectError, mutate: refreshProject } = useSWR<Project>(
    id ? `/api/projects/${id}` : null,
    fetcher
  );
  const { data: runs } = useSWR<AgentRunListItem[]>(
    id ? `/api/runs?project_id=${id}&limit=100` : null,
    fetcher,
    { refreshInterval: 5000 }
  );
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  if (!id) return null;

  if (projectError) {
    if (projectError.status === 401) { router.push("/login"); return null; }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load project</p>
        <p className="mt-1 text-xs text-muted-foreground">{projectError.message}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/")} className="mt-4">Back</Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-xs text-muted-foreground uppercase tracking-widest">Loading project…</p>
      </div>
    );
  }

  async function onCheck() {
    if (!id) return;
    setChecking(true);
    setCheckMsg(null);
    try {
      const r = await api.checkNow(id);
      setCheckMsg(`Checked ${r.deps_checked} deps · ${r.upgrades_found} upgrade${r.upgrades_found !== 1 ? "s" : ""} found`);
      await refreshProject();
    } catch (e) {
      setCheckMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${LANG_COLOR[project.language] ?? "bg-secondary text-secondary-foreground"}`}>
                {project.language}
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{project.repo_path}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onCheck} disabled={checking} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check now"}
            </Button>
            {checkMsg && <span className="text-xs text-muted-foreground">{checkMsg}</span>}
          </div>
        </div>
      </div>

      {/* GitHub connection */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">GitHub</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project.github_connected
              ? `Connected as ${project.github_username ?? "unknown"}`
              : "Connect to select a repo and open pull requests automatically."}
          </p>
        </div>
        {!project.github_connected ? (
          <GithubConnectButton projectId={id} />
        ) : (
          <GithubRepoPicker projectId={id} selectedRepo={project.github_repo_full_name} onSelected={() => { void refreshProject(); }} />
        )}
        {project.github_repo_full_name && (
          <p className="text-xs text-muted-foreground">
            Repo: <span className="font-mono text-foreground">{project.github_repo_full_name}</span>
          </p>
        )}
      </div>

      {project.github_connected && project.github_repo_full_name && (
        <div className="space-y-4">
          <GithubRepoBrowser projectId={id} />
          <GithubPrForm projectId={id} />
        </div>
      )}

      {/* Dependencies */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Dependencies</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project.dependencies.length === 0 ? "No dependencies tracked yet" : `${project.dependencies.length} tracked`}
          </p>
        </div>
        {project.dependencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No dependencies</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Use the watcher or add via the API.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Ecosystem</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Last checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.dependencies.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${ECO_COLOR[d.ecosystem] ?? "bg-secondary text-secondary-foreground"}`}>
                      {d.ecosystem}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.current_version}</TableCell>
                  <TableCell>
                    {d.target_version ? (
                      <span className="rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">{d.target_version}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> up to date
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.last_checked_at ? formatRelative(d.last_checked_at) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Run history */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Run history</h2>
          <p className="text-xs text-muted-foreground mt-0.5">All upgrade attempts on this project</p>
        </div>
        {!runs || runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">No runs yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/runs/${r.id}`}><StatusBadge status={r.status} /></Link></TableCell>
                  <TableCell><VersionBadge from={r.from_version} to={r.to_version} /></TableCell>
                  <TableCell><RewardScore value={r.reward} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDuration(r.started_at, r.finished_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelative(r.started_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
