"use client";

import Link from "next/link";
import useSWR from "swr";
import { Activity, Play } from "lucide-react";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRunListItem } from "@/lib/types";

export default function RunsPage() {
  const { data: runs } = useSWR<AgentRunListItem[]>("/api/runs?limit=200", fetcher, {
    refreshInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            All agent runs
          </div>
          <h1 className="text-4xl font-black tracking-tight">Run history</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            The runs view still shows every dependency upgrade attempt, but it now sits inside the new shadcn workspace shell.
          </p>
        </div>
      </div>

      <Card className="border-border/70 bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>All runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!runs || runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Play className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No runs yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Dependency</TableHead>
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
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {run.dependency_id.slice(0, 8)}...
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
