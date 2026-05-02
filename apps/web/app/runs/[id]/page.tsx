"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { StepTrace } from "@/components/StepTrace";
import { VersionBadge } from "@/components/VersionBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetcher } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRun } from "@/lib/types";

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-card/50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-normal tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: run } = useSWR<AgentRun>(
    id ? `/api/runs/${id}` : null,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest && latest.status === "running" ? 2000 : 0,
    }
  );

  if (!run) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const isViolation = run.status === "tamper_detected" || !!run.violation;

  return (
    <div className="space-y-8 min-h-screen p-4 md:p-8">

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground/90">Agent run</h1>
            <StatusBadge status={run.status} />
          </div>
          <VersionBadge from={run.from_version} to={run.to_version} />
        </div>
        <div className="flex flex-wrap gap-2">
          <StatTile label="Reward" value={<RewardScore value={run.reward} />} />
          <StatTile label="Duration" value={formatDuration(run.started_at, run.finished_at)} />
          <StatTile label="Steps" value={run.steps.length} />
          <StatTile label="Started" value={formatRelative(run.started_at)} />
        </div>
      </div>

      {isViolation && run.violation && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Violation: {run.violation}</p>
          <p className="text-xs opacity-80">
            Reward is forced to −1.0 when the agent tampers with tests or test config.
          </p>
        </div>
      )}

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Test results</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Baseline passed"
            value={run.baseline_passed ?? "—"}
          />
          <StatTile
            label="Baseline failed"
            value={run.baseline_failed ?? "—"}
          />
          <StatTile
            label="Final passed"
            value={run.final_passed ?? "—"}
          />
          <StatTile
            label="Final failed"
            value={run.final_failed ?? "—"}
          />
        </CardContent>
      </Card>

      <Card className="shadow-none border border-white/[0.07] bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg font-medium tracking-tight">Step trace</CardTitle>
        </CardHeader>
        <CardContent>
          <StepTrace steps={run.steps} />
        </CardContent>
      </Card>
    </div>
  );
}
