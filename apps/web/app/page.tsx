"use client";

import Link from "next/link";
import useSWR from "swr";
import { RegisterProjectForm } from "@/components/RegisterProjectForm";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
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
  const { data: projects } = useSWR<ProjectListItem[]>("/api/projects", fetcher);
  const { data: runs } = useSWR<AgentRunListItem[]>("/api/runs?limit=200", fetcher, {
    refreshInterval: 5000,
  });

  const summary = summarise(runs ?? []);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Watch dependencies, track upgrade attempts, and inspect the agent's reasoning.
          </p>
        </div>
        <RegisterProjectForm />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-3xl">{projects?.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active runs today</CardDescription>
            <CardTitle className="text-3xl">{summary.activeToday}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success rate (7d)</CardDescription>
            <CardTitle className="text-3xl">
              {summary.successRate === null ? "—" : `${(summary.successRate * 100).toFixed(0)}%`}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Repos Graft is currently watching.</CardDescription>
        </CardHeader>
        <CardContent>
          {!projects || projects.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No projects yet — register one to begin.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Repo path</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{p.language}</code>
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

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Auto-refreshing every 5s.</CardDescription>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No runs yet.</p>
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
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/runs/${r.id}`} className="hover:underline">
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
