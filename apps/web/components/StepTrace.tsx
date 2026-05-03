"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePen,
  Search,
  Code2,
  BookOpen,
  TestTube2,
  CheckSquare,
} from "lucide-react";
import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import type { StepRecord } from "@/lib/types";

const TOOL_META: Record<string, { icon: ElementType; color: string; bg: string }> = {
  read_file:      { icon: FileText,    color: "text-sky-400",     bg: "bg-sky-500/20" },
  edit_file:      { icon: FilePen,     color: "text-amber-400",   bg: "bg-amber-500/20" },
  grep_repo:      { icon: Search,      color: "text-violet-400",  bg: "bg-violet-500/20" },
  ast_query:      { icon: Code2,       color: "text-indigo-400",  bg: "bg-indigo-500/20" },
  read_changelog: { icon: BookOpen,    color: "text-emerald-400", bg: "bg-emerald-500/20" },
  run_tests:      { icon: TestTube2,   color: "text-rose-400",    bg: "bg-rose-500/20" },
  submit:         { icon: CheckSquare, color: "text-green-400",   bg: "bg-green-500/20" },
};

const DEFAULT_META = { icon: Code2, color: "text-muted-foreground", bg: "bg-secondary" };

function StepArgs({ args }: { args: Record<string, unknown> }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-muted-foreground">
      {JSON.stringify(args, null, 2)}
    </pre>
  );
}

function StepResult({ result }: { result: string }) {
  const truncated = result.length > 1000;
  const [expanded, setExpanded] = useState(false);
  const display = expanded || !truncated ? result : `${result.slice(0, 1000)}…`;
  return (
    <div className="space-y-1.5">
      <pre className="whitespace-pre-wrap break-words overflow-x-auto rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-foreground/80">
        {display}
      </pre>
      {truncated && (
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : `Show ${result.length - 1000} more chars`}
        </button>
      )}
    </div>
  );
}

function StepEntry({ step, index }: { step: StepRecord; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[step.tool] ?? DEFAULT_META;
  const Icon = meta.icon;

  return (
    <li className="relative pl-10">
      {/* Timeline dot */}
      <span className="absolute left-0 top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card">
        <span className="text-[10px] font-mono text-muted-foreground">{step.step_no}</span>
      </span>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-2.5">
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            </span>
            <code className="font-mono text-sm font-semibold text-foreground">{step.tool}</code>
            {step.duration_ms !== null && step.duration_ms !== undefined && (
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {step.duration_ms}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <time className="text-xs text-muted-foreground">
              {new Date(step.timestamp).toLocaleTimeString()}
            </time>
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </button>

        {open && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Arguments
              </p>
              <StepArgs args={step.args} />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Result
              </p>
              <StepResult result={step.result} />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export function StepTrace({
  steps,
  className,
}: {
  steps: StepRecord[];
  className?: string;
}) {
  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
          <Code2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No steps yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          The agent will begin once it picks up this run.
        </p>
      </div>
    );
  }

  return (
    <ol className={cn("relative space-y-3 border-l-2 border-border pl-2", className)}>
      {steps.map((s, i) => (
        <StepEntry key={s.step_no} step={s} index={i} />
      ))}
    </ol>
  );
}

