"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Plus } from "lucide-react";
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
  const router = useRouter();

  if (!id) return null;

  if (projectError) {
    if (projectError.status === 401) {
      router.push("/login");
      return null;
    }
    return (
      <div className="p-8 space-y-4">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/20 bg-destructive/5 p-12 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load project</p>
          <p className="text-xs text-muted-foreground mt-1">{projectError.message}</p>
          <Button variant="outline" onClick={() => router.push("/")} className="mt-6 border-white/[0.07] bg-background/50">
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground mt-4 font-medium tracking-widest uppercase">Loading project…</p>
      </div>
    );
  }

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


  return (
    <div className="space-y-8 min-h-screen p-4 md:p-8">

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground/90">{project.name}</h1>
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

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Dependencies</CardTitle>
          <CardDescription>
            {project.dependencies.length === 0
              ? "No dependencies registered yet."
              : `${project.dependencies.length} tracked.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {project.dependencies.length === 0 ? (
            <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.07] p-10 text-center">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">No dependencies yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add dependencies via the API or use the watcher's auto-discovery.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Ecosystem</TableHead>
                  <TableHead className="font-semibold">Current</TableHead>
                  <TableHead className="font-semibold">Target</TableHead>
                  <TableHead className="font-semibold">Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.dependencies.map((d) => (
                  <TableRow key={d.id} className="transition-colors hover:bg-muted/50">
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

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Run history</CardTitle>
          <CardDescription>All upgrade attempts on this project.</CardDescription>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.07] p-10 text-center">
              <p className="text-sm font-medium text-foreground">No runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">Upgrade attempts will appear here automatically.</p>
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
                {runs.map((r) => (
                  <TableRow key={r.id} className="transition-colors hover:bg-muted/50">
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
