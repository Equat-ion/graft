import { cn } from "@/lib/utils";

export function RewardScore({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <span className={cn("text-muted-foreground tabular-nums", className)}></span>;
  }
  let color = "text-red-400";
  if (value >= 0.8) color = "text-emerald-400";
  else if (value >= 0.4) color = "text-amber-400";
  return (
    <span className={cn("font-mono tabular-nums font-medium", color, className)}>
      {value.toFixed(2)}
    </span>
  );
}
