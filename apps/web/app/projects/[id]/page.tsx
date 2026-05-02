"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRunListItem, Project } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: project, mutate: refreshProject } = useSWR<Project>(
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

  async function onCheck() {
    if (!id) return;
    setChecking(true);
    setCheckMsg(null);
    try {
      const r = await api.checkNow(id);
      setCheckMsg(`Checked ${r.deps_checked} deps, ${r.upgrades_found} upgrades.`);
      await refreshProject();
    } catch (e) {
      setCheckMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  if (!project) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{project.repo_path}</p>
          <Badge variant="outline" className="mt-2">
            {project.language}
          </Badge>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button onClick={onCheck} disabled={checking}>
            {checking ? "Checking…" : "Check now"}
          </Button>
          {checkMsg && <span className="text-xs text-muted-foreground">{checkMsg}</span>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
          <CardDescription>
            {project.dependencies.length === 0
              ? "No dependencies registered yet."
              : `${project.dependencies.length} tracked.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {project.dependencies.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Add dependencies via the API or use the watcher's auto-discovery.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
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
                      <code className="text-xs">{d.ecosystem}</code>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.current_version}</TableCell>
                    <TableCell>
                      {d.target_version ? (
                        <Badge variant="info">{d.target_version}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">up to date</span>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>All upgrade attempts on this project.</CardDescription>
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
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/runs/${r.id}`}>
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
