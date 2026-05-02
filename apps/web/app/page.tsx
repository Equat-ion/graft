"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { Plus } from "lucide-react";
import { RegisterProjectForm } from "@/components/RegisterProjectForm";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects, error: projectsError } = useSWR<ProjectListItem[]>("/api/projects", fetcher);
  const { data: runs, error: runsError } = useSWR<AgentRunListItem[]>("/api/runs?limit=200", fetcher, {
    refreshInterval: 5000,
  });

  if (projectsError || runsError) {
    const err = projectsError || runsError;
    if (err.status === 401) {
      router.push("/login");
      return null;
    }
    return (
      <div className="p-8 space-y-4">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/20 bg-destructive/5 p-12 text-center">
          <p className="text-sm font-medium text-destructive">Dashboard failed to load</p>
          <p className="text-xs text-muted-foreground mt-1">{err.message}</p>
          <Button variant="outline" onClick={() => mutate("/api/projects")} className="mt-6 border-white/[0.07] bg-background/50">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!projects || !runs) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground mt-4 font-medium tracking-widest uppercase">Loading dashboard…</p>
      </div>
    );
  }

  const summary = summarise(runs ?? []);

  return (
    <div className="space-y-8 min-h-screen p-4 md:p-8">

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground/90">Dashboard</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Watch dependencies, track upgrade attempts, and inspect the agent's reasoning.
          </p>
        </div>
        <RegisterProjectForm />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card className="shadow-none border border-white/[0.07] bg-card/50">
          <CardHeader className="pb-4">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Projects</CardDescription>
            <CardTitle className="text-3xl font-normal tracking-tight">{projects?.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-none border border-white/[0.07] bg-card/50">
          <CardHeader className="pb-4">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Active runs today</CardDescription>
            <CardTitle className="text-3xl font-normal tracking-tight">{summary.activeToday}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-none border border-white/[0.07] bg-card/50">
          <CardHeader className="pb-4">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Success rate (7d)</CardDescription>
            <CardTitle className="text-3xl font-normal tracking-tight">
              {summary.successRate === null ? "—" : `${(summary.successRate * 100).toFixed(0)}%`}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Projects</CardTitle>
          <CardDescription>Repos Graft is currently watching.</CardDescription>
        </CardHeader>
        <CardContent>
          {!projects || projects.length === 0 ? (
            <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.07] p-10 text-center">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="text-sm text-muted-foreground mt-1">Register a repo to start watching dependencies.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Language</TableHead>
                  <TableHead className="font-semibold">Repo path</TableHead>
                  <TableHead className="font-semibold">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id} className="transition-colors hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground/70">{p.language}</code>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.repo_path}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(p.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Recent runs</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
            </span>
            Auto-refreshing every 5s
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.07] p-10 text-center">
              <p className="text-sm font-medium text-foreground">No runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">Runs will appear here once a project is registered.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Version</TableHead>
                  <TableHead className="font-semibold">Reward</TableHead>
                  <TableHead className="font-semibold">Duration</TableHead>
                  <TableHead className="font-semibold">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, 30).map((r) => (
                  <TableRow key={r.id} className="transition-colors hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/runs/${r.id}`} className="hover:opacity-80 transition-opacity">
                        <StatusBadge status={r.status} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <VersionBadge from={r.from_version} to={r.to_version} />
                    </TableCell>
                    <TableCell>
                      <RewardScore value={r.reward} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDuration(r.started_at, r.finished_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(r.started_at)}
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
