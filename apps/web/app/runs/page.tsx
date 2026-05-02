"use client";

import Link from "next/link";
import useSWR from "swr";
import { Play } from "lucide-react";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">All agent upgrade attempts</p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">All runs</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Auto-refreshing every 5s</p>
        </div>
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
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/runs/${r.id}`}>
                      <StatusBadge status={r.status} />
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.dependency_id.slice(0, 8)}…
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
      </div>
    </div>
  );
}
