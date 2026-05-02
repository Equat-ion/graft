import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function VersionBadge({
  from,
  to,
  className,
}: {
  from: string | null;
  to: string | null;
  className?: string;
}) {
  if (!from && !to) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}>
      <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">{from ?? "?"}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
        {to ?? "?"}
      </span>
    </span>
  );
}
