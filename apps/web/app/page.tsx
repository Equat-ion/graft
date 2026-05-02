"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { ArrowRight, Boxes, CheckCircle2, Loader2, Plus, TrendingUp } from "lucide-react";
import { RegisterProjectForm } from "@/components/RegisterProjectForm";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRunListItem, ProjectListItem } from "@/lib/types";

function summarise(runs: AgentRunListItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last7d = new Date(today);
  last7d.setDate(last7d.getDate() - 7);
  const activeToday = runs.filter(
    (r) => new Date(r.started_at) >= today && (r.status === "pending" || r.status === "running")
  ).length;
  const recent = runs.filter(
    (r) => new Date(r.started_at) >= last7d && r.status !== "running" && r.status !== "pending"
  );
  const successes = recent.filter((r) => r.status === "success").length;
  const successRate = recent.length === 0 ? null : successes / recent.length;
  return { activeToday, successRate, totalRuns: runs.length };
}

function StatCard({
  label, value, sub, icon: Icon, gradient, iconColor,
}: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ElementType; gradient: string; iconColor: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border p-5 ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects, error: projectsError } = useSWR<ProjectListItem[]>("/api/projects", fetcher);
  const { data: runs, error: runsError } = useSWR<AgentRunListItem[]>("/api/runs?limit=200", fetcher, {
    refreshInterval: 5000,
  });

  if (projectsError || runsError) {
    const err = projectsError || runsError;
    if (err?.status === 401) { router.push("/login"); return null; }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load dashboard</p>
        <p className="mt-1 text-xs text-muted-foreground">{err?.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate("/api/projects")} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!projects || !runs) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-xs text-muted-foreground uppercase tracking-widest">Loading…</p>
      </div>
    );
  }

  const summary = summarise(runs);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Dependency upgrade agent — watching your repos.</p>
        </div>
        <RegisterProjectForm />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Projects" value={projects.length}
          sub={`${projects.length} repo${projects.length !== 1 ? "s" : ""} registered`}
          icon={Boxes} gradient="card-gradient-blue" iconColor="bg-indigo-500/20 text-indigo-400" />
        <StatCard label="Active today" value={summary.activeToday} sub="pending or running"
          icon={Loader2} gradient="card-gradient-violet" iconColor="bg-violet-500/20 text-violet-400" />
        <StatCard label="Success rate (7d)"
          value={summary.successRate === null ? "—" : `${(summary.successRate * 100).toFixed(0)}%`}
          sub={`${summary.totalRuns} total runs`}
          icon={TrendingUp} gradient="card-gradient-emerald" iconColor="bg-emerald-500/20 text-emerald-400" />
      </div>

      {/* Projects */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Projects</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Repos Graft is watching</p>
          </div>
        </div>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Register a repo to start watching dependencies.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>GitHub</TableHead>
                <TableHead>Repo path</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-accent/60 px-2 py-0.5 font-mono text-[11px] text-accent-foreground">{p.language}</span>
                  </TableCell>
                  <TableCell>
                    {p.github_connected ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {p.github_username ?? "connected"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground max-w-xs truncate">{p.repo_path}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelative(p.created_at)}</TableCell>
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary">
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Recent runs */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Recent runs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-refreshing every 5s</p>
          </div>
          {runs.length > 0 && (
            <Link href="/runs" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No runs yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">Runs appear when the watcher detects an upgrade.</p>
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
              {runs.slice(0, 30).map((r) => (
                <TableRow key={r.id} className="group cursor-pointer">
                  <TableCell>
                    <Link href={`/runs/${r.id}`}><StatusBadge status={r.status} /></Link>
                  </TableCell>
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
