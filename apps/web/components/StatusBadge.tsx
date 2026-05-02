import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

const STATUS_STYLE: Record<RunStatus, string> = {
  pending:        "bg-secondary text-secondary-foreground border-border",
  running:        "bg-sky-500/20 text-sky-300 border-sky-500/30",
  success:        "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  failed:         "bg-red-500/20 text-red-300 border-red-500/30",
  tamper_detected:"bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const STATUS_DOT: Record<RunStatus, string> = {
  pending:        "bg-secondary-foreground/50",
  running:        "bg-sky-400 animate-pulse",
  success:        "bg-emerald-400",
  failed:         "bg-red-400",
  tamper_detected:"bg-orange-400",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending:        "Pending",
  running:        "Running",
  success:        "Success",
  failed:         "Failed",
  tamper_detected:"Tamper",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STATUS_STYLE[status]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
