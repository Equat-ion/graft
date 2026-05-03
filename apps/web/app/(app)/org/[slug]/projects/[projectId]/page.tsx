"use client";

import { use, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Clock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrontendDep {
  id: string;
  name: string;
  ecosystem: "npm" | "pypi";
  currentVersion: string;
  latestVersion: string | null;
  status: "up-to-date" | "outdated" | "pr-open" | "failed" | "ignored";
  manifestFile: string;
  lastCheckedAt: string | null;
}

interface FrontendProject {
  id: string;
  name: string;
  repoFullName: string;
  defaultBranch: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  dependencies: FrontendDep[];
}

interface UpdateJob {
  id: string;
  dependencyId: string;
  agentJobId: string | null;
  status: "queued" | "running" | "pr-open" | "failed" | "cancelled";
  prUrl: string | null;
  prNumber: number | null;
  triggeredAt: string;
  completedAt: string | null;
  depName: string;
  ecosystem: "npm" | "pypi";
  currentVersion: string;
  latestVersion: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = use(params);
  const [syncing, setSyncing] = useState(false);

  const {
    data: project,
    isLoading: projectLoading,
    mutate: mutateProject,
  } = useSWR<FrontendProject>(`/api/projects/${projectId}`, fetcher);

  const {
    data: jobs,
    isLoading: jobsLoading,
    mutate: mutateJobs,
  } = useSWR<UpdateJob[]>(`/api/projects/${projectId}/jobs`, fetcher);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Sync started — dependencies refreshing in background.");
      setTimeout(() => {
        mutateProject();
      }, 3000);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleTrigger(dep: FrontendDep) {
    try {
      const res = await fetch(`/api/projects/${projectId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depId: dep.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(
        `Upgrade queued for ${dep.name} → ${dep.latestVersion}`
      );
      await mutateJobs();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to trigger upgrade");
    }
  }

  const deps = project?.dependencies ?? [];
  const total = deps.length;
  const upToDate = deps.filter(
    (d) => !d.latestVersion || d.latestVersion === d.currentVersion
  ).length;
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
          <a
            href={`https://github.com/${project.repoFullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <GithubIcon className="h-3.5 w-3.5" />
            {project.repoFullName}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
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

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total dependencies" value={total} />
        <StatCard label="Up to date" value={upToDate} variant="success" />
        <StatCard
          label="Outdated"
          value={outdated}
          variant={outdated > 0 ? "warning" : "default"}
        />
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
          <TabsTrigger value="jobs">
            Update Jobs
            {jobs && jobs.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {jobs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Dependencies tab */}
        <TabsContent value="dependencies">
          <Card>
            <CardContent className="p-0">
              {!deps || deps.length === 0 ? (
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
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deps.map((dep) => (
                      <DepRow
                        key={dep.id}
                        dep={dep}
                        onTrigger={handleTrigger}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs tab */}
        <TabsContent value="jobs">
          <Card>
            <CardContent className="p-0">
              {jobsLoading ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : !jobs || jobs.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No upgrade jobs yet. Trigger one from the Dependencies tab.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Upgrade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pull Request</TableHead>
                      <TableHead>Triggered</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <JobRow key={job.id} job={job} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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

function DepStatusBadge({ dep }: { dep: FrontendDep }) {
  if (dep.status === "pr-open") {
    return (
      <Badge variant="outline" className="gap-1 border-purple-500/30 text-purple-400 text-xs">
        <GitPullRequest className="h-3 w-3" /> PR open
      </Badge>
    );
  }
  if (dep.status === "outdated") {
    return (
      <Badge variant="outline" className="gap-1 border-yellow-500/30 text-yellow-400 text-xs">
        <AlertTriangle className="h-3 w-3" /> Outdated
      </Badge>
    );
  }
  if (dep.status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-red-500/30 text-red-400 text-xs">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-green-500/30 text-green-400 text-xs">
      <CheckCircle2 className="h-3 w-3" /> Up to date
    </Badge>
  );
}

function DepRow({
  dep,
  onTrigger,
}: {
  dep: FrontendDep;
  onTrigger: (dep: FrontendDep) => Promise<void>;
}) {
  const [triggering, setTriggering] = useState(false);
  const isOutdated =
    dep.latestVersion && dep.latestVersion !== dep.currentVersion;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <a
          href={
            dep.ecosystem === "npm"
              ? `https://www.npmjs.com/package/${dep.name}`
              : `https://pypi.org/project/${dep.name}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:underline"
        >
          {dep.name}
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </a>
      </TableCell>
      <TableCell>
        <EcosystemBadge eco={dep.ecosystem} />
      </TableCell>
      <TableCell className="font-mono text-sm">{dep.currentVersion}</TableCell>
      <TableCell className="font-mono text-sm">
        {dep.latestVersion ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <DepStatusBadge dep={dep} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {dep.lastCheckedAt ? formatDistanceToNow(dep.lastCheckedAt) : "—"}
      </TableCell>
      <TableCell>
        {isOutdated && dep.status !== "pr-open" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={triggering}
            onClick={async () => {
              setTriggering(true);
              await onTrigger(dep).finally(() => setTriggering(false));
            }}
          >
            {triggering ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            Upgrade
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function JobStatusBadge({ status }: { status: UpdateJob["status"] }) {
  switch (status) {
    case "pr-open":
      return (
        <Badge variant="outline" className="gap-1 border-purple-500/30 text-purple-400 text-xs">
          <GitPullRequest className="h-3 w-3" /> PR open
        </Badge>
      );
    case "running":
      return (
        <Badge variant="outline" className="gap-1 border-blue-500/30 text-blue-400 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="outline" className="gap-1 border-yellow-500/30 text-yellow-400 text-xs">
          <Clock className="h-3 w-3" /> Queued
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="gap-1 border-red-500/30 text-red-400 text-xs">
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="gap-1 border-muted text-muted-foreground text-xs">
          Cancelled
        </Badge>
      );
  }
}

function JobRow({ job }: { job: UpdateJob }) {
  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{job.depName}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {job.currentVersion} → {job.latestVersion ?? "?"}
      </TableCell>
      <TableCell>
        <JobStatusBadge status={job.status} />
      </TableCell>
      <TableCell>
        {job.prUrl ? (
          <a
            href={job.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <GitPullRequest className="h-3 w-3" />#{job.prNumber}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDistanceToNow(job.triggeredAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {job.completedAt ? formatDistanceToNow(job.completedAt) : "—"}
      </TableCell>
    </TableRow>
  );
}
