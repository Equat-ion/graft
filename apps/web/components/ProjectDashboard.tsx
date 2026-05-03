"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import type { ElementType, ReactNode } from "react";
import { ArrowLeft, Package, RefreshCw } from "lucide-react";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { GithubConnectButton } from "@/components/GithubConnectButton";
import { GithubPrForm } from "@/components/GithubPrForm";
import { GithubRepoBrowser } from "@/components/GithubRepoBrowser";
import { GithubRepoPicker } from "@/components/GithubRepoPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRunListItem, Project } from "@/lib/types";

const LANG_COLOR: Record<string, string> = {
  python: "bg-sky-500/15 text-sky-300",
  javascript: "bg-amber-500/15 text-amber-300",
  typescript: "bg-cyan-500/15 text-cyan-300",
  rust: "bg-orange-500/15 text-orange-300",
};

const ECO_COLOR: Record<string, string> = {
  pypi: "bg-sky-500/15 text-sky-300",
  npm: "bg-red-500/15 text-red-300",
  crates: "bg-orange-500/15 text-orange-300",
};

function Tile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ElementType;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur">
      <div className="mb-1 flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ProjectDashboard({
  projectId,
  orgSlug,
}: {
  projectId: string;
  orgSlug?: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const { data: project, error: projectError, mutate: refreshProject } = useSWR<Project>(
    `/api/projects/${projectId}`,
    fetcher
  );
  const { data: runs } = useSWR<AgentRunListItem[]>(
    `/api/runs?project_id=${projectId}&limit=100`,
    fetcher,
    { refreshInterval: 5000 }
  );

  if (projectError) {
    if (projectError.status === 401) {
      router.push("/login");
      return null;
    }

    return (
      <Card className="border-border/70 bg-card/70">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load project</p>
          <p className="mt-1 text-xs text-muted-foreground">{projectError.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(orgSlug ? `/app/org/${orgSlug}` : "/app")}
            className="mt-4"
          >
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  async function onCheck() {
    setChecking(true);
    setCheckMessage(null);
    try {
      const result = await api.checkNow(projectId);
      setCheckMessage(
        `Checked ${result.deps_checked} deps · ${result.upgrades_found} upgrade${
          result.upgrades_found === 1 ? "" : "s"
        } found`
      );
      await refreshProject();
    } catch (cause) {
      setCheckMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={orgSlug ? `/app/org/${orgSlug}` : "/app"}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {orgSlug ? "Back to org" : "Back to organizations"}
          </Link>
          <div className="flex flex-col items-end gap-2">
            <Button variant="outline" size="sm" onClick={onCheck} className="gap-2" disabled={checking}>
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking..." : "Check now"}
            </Button>
            {checkMessage && <p className="text-xs text-muted-foreground">{checkMessage}</p>}
          </div>
        </div>

        <Card className="border-border/70 bg-card/70 backdrop-blur">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black tracking-tight">{project.name}</h1>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${LANG_COLOR[project.language] ?? "bg-secondary text-secondary-foreground"}`}
                  >
                    {project.language}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{project.repo_path}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Project</p>
                <p className="mt-1 text-sm font-medium">ID {project.id.slice(0, 8)}...</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">GitHub</p>
                <p className="mt-2 text-sm font-medium">
                  {project.github_connected
                    ? `Connected as ${project.github_username ?? "unknown"}`
                    : "Not connected"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Dependencies</p>
                <p className="mt-2 text-sm font-medium">{project.dependencies.length} tracked</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Run history</p>
                <p className="mt-2 text-sm font-medium">{runs?.length ?? 0} runs loaded</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>GitHub connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {project.github_connected
              ? `Connected as ${project.github_username ?? "unknown"}`
              : "Connect GitHub to select a repo and open pull requests automatically."}
          </p>
          {!project.github_connected ? (
            <GithubConnectButton projectId={projectId} />
          ) : (
            <GithubRepoPicker
              projectId={projectId}
              selectedRepo={project.github_repo_full_name}
              onSelected={() => {
                void refreshProject();
              }}
            />
          )}
          {project.github_repo_full_name && (
            <p className="text-xs text-muted-foreground">
              Repo: <span className="font-mono text-foreground">{project.github_repo_full_name}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {project.github_connected && project.github_repo_full_name && (
        <div className="space-y-4">
          <GithubRepoBrowser projectId={projectId} />
          <GithubPrForm projectId={projectId} />
        </div>
      )}

      <Card className="border-border/70 bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {project.dependencies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No dependencies</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Use the watcher or add them via the API.</p>
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
                {project.dependencies.map((dependency) => (
                  <TableRow key={dependency.id}>
                    <TableCell className="font-medium">{dependency.name}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ECO_COLOR[dependency.ecosystem] ?? "bg-secondary text-secondary-foreground"}`}
                      >
                        {dependency.ecosystem}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{dependency.current_version}</TableCell>
                    <TableCell>
                      {dependency.target_version ? (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-300">
                          {dependency.target_version}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400">up to date</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dependency.last_checked_at ? formatRelative(dependency.last_checked_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link href={`/runs/${run.id}`}>
                        <StatusBadge status={run.status} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <VersionBadge from={run.from_version} to={run.to_version} />
                    </TableCell>
                    <TableCell>
                      <RewardScore value={run.reward} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDuration(run.started_at, run.finished_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(run.started_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
