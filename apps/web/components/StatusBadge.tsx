import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/types";

const STATUS_VARIANT: Record<RunStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  pending: "secondary",
  running: "info",
  success: "success",
  failed: "destructive",
  tamper_detected: "destructive",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  success: "Success",
  failed: "Failed",
  tamper_detected: "Tamper detected",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
