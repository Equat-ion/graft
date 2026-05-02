"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, GitCommit, Zap } from "lucide-react";
import { RewardScore } from "@/components/RewardScore";
import { StatusBadge } from "@/components/StatusBadge";
import { StepTrace } from "@/components/StepTrace";
import { VersionBadge } from "@/components/VersionBadge";
import { fetcher } from "@/lib/api";
import { cn, formatDuration, formatRelative } from "@/lib/utils";
import type { AgentRun } from "@/lib/types";

function Tile({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TestBar({
  passed,
  failed,
  label,
}: {
  passed: number | null;
  failed: number | null;
  label: string;
}) {
  const total = (passed ?? 0) + (failed ?? 0);
  const pct = total > 0 ? ((passed ?? 0) / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="text-emerald-400">{passed ?? "—"}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-red-400">{failed ?? "—"}</span>
        </span>
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
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
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading run…
      </div>
    );
  }

  const isViolation = run.status === "tamper_detected" || !!run.violation;
  const isRunning = run.status === "running";

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="space-y-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Agent run</h1>
          <StatusBadge status={run.status} />
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              Live polling…
            </span>
          )}
        </div>
        <VersionBadge from={run.from_version} to={run.to_version} />
      </div>

      {/* Violation banner */}
      {isViolation && run.violation && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-400">Violation: {run.violation}</p>
            <p className="mt-0.5 text-xs text-red-400/70">
              The agent tampered with the test suite. Reward forced to −1.0.
            </p>
          </div>
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Reward" value={<RewardScore value={run.reward} />} icon={Zap} />
        <Tile label="Duration" value={formatDuration(run.started_at, run.finished_at)} icon={Clock} />
        <Tile label="Steps" value={run.steps.length} icon={GitCommit} />
        <Tile label="Started" value={formatRelative(run.started_at)} icon={CheckCircle2} />
      </div>

      {/* Test results */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Test results</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TestBar passed={run.baseline_passed} failed={run.baseline_failed} label="Baseline" />
          <TestBar passed={run.final_passed} failed={run.final_failed} label="Final" />
        </div>
        {run.baseline_passed !== null && run.final_passed !== null && (
          <p className="text-xs text-muted-foreground">
            {run.final_passed > run.baseline_passed ? (
              <span className="text-emerald-400">
                +{run.final_passed - run.baseline_passed} tests now passing
              </span>
            ) : run.final_passed < run.baseline_passed ? (
              <span className="text-red-400">
                {run.baseline_passed - run.final_passed} regressions introduced
              </span>
            ) : (
              <span>No change in passing tests</span>
            )}
          </p>
        )}
      </div>

      {/* Step trace */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Step trace</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {run.steps.length} tool call{run.steps.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="p-5">
          <StepTrace steps={run.steps} />
        </div>
      </div>
    </div>
  );
}
