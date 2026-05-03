"use client";

import { use, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  getAgentProject,
  listDeps,
  listRuns,
  checkNow,
  cancelRun,
  type AgentDependency,
  type AgentRun,
  type AgentProject,
} from "@/lib/agent-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { GithubIcon } from "@/components/icons";
import {
  RefreshCw,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  GitPullRequest,
  XCircle,
  PauseCircle,
  Clock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = use(params);
  const [selectedDep, setSelectedDep] = useState<AgentDependency | null>(null);
  const [syncing, setSyncing] = useState(false);

  const {
    data: project,
    isLoading: projectLoading,
    mutate: mutateProject,
  } = useSWR<AgentProject>(`project:${projectId}`, () =>
    getAgentProject(projectId)
  );

  const { data: deps, isLoading: depsLoading, mutate: mutateDeps } = useSWR<
    AgentDependency[]
  >(`deps:${projectId}`, () => listDeps(projectId));

  const { data: runs, isLoading: runsLoading, mutate: mutateRuns } = useSWR<
    AgentRun[]
  >(`runs:${projectId}`, () => listRuns(projectId));

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await checkNow(projectId);
      toast.success(
        `Synced — ${result.deps_checked} dependencies checked, ${result.upgrades_found} upgrades found.`
      );
      await mutateDeps();
      await mutateProject();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Stats
  const total = deps?.length ?? 0;
  const upToDate = deps?.filter((d) => d.target_version === null || d.current_version === d.target_version).length ?? 0;
  const outdated = total - upToDate;
  const healthPct = total ? Math.round((upToDate / total) * 100) : 100;

  if (projectLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 text-center">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href={`/org/${slug}`} className="hover:text-foreground">
              {slug}
            </Link>
            <span>/</span>
            <span>{project.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.github_repo_full_name && (
            <a
              href={`https://github.com/${project.github_repo_full_name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              {project.github_repo_full_name}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex gap-3">
          {!project.github_connected && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/github/oauth/start?project_id=${projectId}`}
                id="btn-connect-github"
              >
                <GithubIcon className="mr-2 h-4 w-4" /> Connect GitHub
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            id="btn-sync-deps"
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync now
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total dependencies" value={total} />
        <StatCard label="Up to date" value={upToDate} variant="success" />
        <StatCard label="Outdated" value={outdated} variant={outdated > 0 ? "warning" : "default"} />
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Health
            </p>
            <p className="mt-1 text-2xl font-bold">{healthPct}%</p>
            <Progress value={healthPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dependencies">
        <TabsList className="mb-6">
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="runs">Agent Runs</TabsTrigger>
        </TabsList>

        {/* Dependencies tab */}
        <TabsContent value="dependencies">
          <Card>
            <CardContent className="p-0">
              {depsLoading ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : !deps || deps.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    No dependencies found. Run a sync to discover them.
                  </p>
                  <Button size="sm" onClick={handleSync} disabled={syncing}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Sync now
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Ecosystem</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Checked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deps.map((dep) => (
                      <TableRow
                        key={dep.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedDep(dep)}
                      >
                        <TableCell className="font-medium">
                          <a
                            href={
                              dep.ecosystem === "npm"
                                ? `https://www.npmjs.com/package/${dep.name}`
                                : `https://pypi.org/project/${dep.name}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 hover:underline"
                          >
                            {dep.name}
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <EcosystemBadge eco={dep.ecosystem} />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {dep.current_version}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {dep.target_version ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DepStatusBadge dep={dep} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dep.last_checked_at
                            ? formatDistanceToNow(dep.last_checked_at)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Runs tab */}
        <TabsContent value="runs">
          <Card>
            <CardContent className="p-0">
              {runsLoading ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : !runs || runs.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No agent runs yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dependency</TableHead>
                      <TableHead>Upgrade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Finished</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <RunRow
                        key={run.id}
                        run={run}
                        deps={deps}
                        onCancel={async () => {
                          await cancelRun(run.id);
                          await mutateRuns();
                        }}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dependency detail drawer */}
      <Sheet open={!!selectedDep} onOpenChange={() => setSelectedDep(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selectedDep && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{selectedDep.name}</SheetTitle>
                <SheetDescription>
                  <EcosystemBadge eco={selectedDep.ecosystem} />
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Current version
                    </p>
                    <p className="font-mono">{selectedDep.current_version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Latest version
                    </p>
                    <p className="font-mono">
                      {selectedDep.target_version ?? "—"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Registry link
                  </p>
                  <a
                    href={
                      selectedDep.ecosystem === "npm"
                        ? `https://www.npmjs.com/package/${selectedDep.name}`
                        : `https://pypi.org/project/${selectedDep.name}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm flex items-center gap-1 hover:underline text-primary"
                  >
                    View on {selectedDep.ecosystem === "npm" ? "npm" : "PyPI"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Related runs
                  </p>
                  {runs
                    ?.filter((r) => r.dependency_id === selectedDep.id)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-md border border-border p-2 text-xs mb-2"
                      >
                        <div className="flex items-center gap-2">
                          <RunStatusIcon status={r.status} />
                          <span className="capitalize">{r.status}</span>
                        </div>
                        <span className="text-muted-foreground font-mono">
                          {r.from_version} → {r.to_version}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p
          className={cn("mt-1 text-2xl font-bold", {
            "text-green-500": variant === "success",
            "text-yellow-500": variant === "warning",
          })}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EcosystemBadge({ eco }: { eco: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        eco === "npm"
          ? "border-red-500/30 text-red-400"
          : "border-blue-500/30 text-blue-400"
      )}
    >
      {eco}
    </Badge>
  );
}

function DepStatusBadge({ dep }: { dep: AgentDependency }) {
  const isOutdated =
    dep.target_version && dep.current_version !== dep.target_version;

  if (!isOutdated) {
    return (
      <Badge variant="outline" className="gap-1 border-green-500/30 text-green-400 text-xs">
        <CheckCircle2 className="h-3 w-3" /> Up to date
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 border-yellow-500/30 text-yellow-400 text-xs">
      <AlertTriangle className="h-3 w-3" /> Outdated
    </Badge>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
    case "pending":
      return <Clock className="h-3.5 w-3.5 text-yellow-400" />;
    case "failed":
    case "tamper_detected":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function RunRow({
  run,
  deps,
  onCancel,
}: {
  run: AgentRun;
  deps?: AgentDependency[];
  onCancel: () => Promise<void>;
}) {
  const dep = deps?.find((d) => d.id === run.dependency_id);
  const [cancelling, setCancelling] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">
        {dep?.name ?? run.dependency_id.slice(0, 8)}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {run.from_version ?? "?"} → {run.to_version ?? "?"}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-xs">
          <RunStatusIcon status={run.status} />
          <span className="capitalize">{run.status.replace("_", " ")}</span>
        </span>
      </TableCell>
      <TableCell className="text-xs">
        {run.reward != null ? run.reward.toFixed(2) : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDistanceToNow(run.started_at)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {run.finished_at ? formatDistanceToNow(run.finished_at) : "—"}
      </TableCell>
      <TableCell>
        {(run.status === "pending" || run.status === "running") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive"
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true);
              await onCancel().finally(() => setCancelling(false));
            }}
          >
            {cancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Cancel"
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
