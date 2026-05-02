"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StepRecord } from "@/lib/types";

function StepArgs({ args }: { args: Record<string, unknown> }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
      {JSON.stringify(args, null, 2)}
    </pre>
  );
}

function StepResult({ result }: { result: string }) {
  const truncated = result.length > 800;
  const [expanded, setExpanded] = useState(false);
  const display = expanded || !truncated ? result : `${result.slice(0, 800)}…`;
  return (
    <div className="space-y-1">
      <pre className="whitespace-pre-wrap break-words rounded-md bg-secondary/50 p-3 text-xs leading-relaxed">
        {display}
      </pre>
      {truncated && (
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : `Show ${result.length - 800} more chars`}
        </button>
      )}
    </div>
  );
}

function StepEntry({ step }: { step: StepRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative pl-10">
      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs font-mono">
        {step.step_no}
      </span>
      <div className="rounded-md border bg-card p-3">
        <button
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <code className="font-mono text-sm font-semibold">{step.tool}</code>
            {step.duration_ms !== null && step.duration_ms !== undefined && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {step.duration_ms}ms
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <time>{new Date(step.timestamp).toLocaleTimeString()}</time>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        </button>
        {open && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Arguments</p>
              <StepArgs args={step.args} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Result</p>
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
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No steps yet. The agent will begin once it picks up this run.
      </div>
    );
  }
  return (
    <ol className={cn("relative space-y-3 border-l-2 border-muted pl-2", className)}>
      {steps.map((s) => (
        <StepEntry key={s.step_no} step={s} />
      ))}
    </ol>
  );
}
