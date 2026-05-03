"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { useSession, useListOrganizations } from "@/lib/auth-client";
import { listAgentProjects, type AgentProjectListItem } from "@/lib/agent-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Plus,
  FolderGit2,
  Building2,
  Loader2,
  ArrowRight,
} from "lucide-react";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { data: orgs } = useListOrganizations();

  const { data: projects, isLoading: projectsLoading } = useSWR<AgentProjectListItem[]>(
    "projects",
    () => listAgentProjects()
  );

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/auth/login");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of all your projects and organisations.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/org/new">
              <Building2 className="mr-2 h-4 w-4" /> New organisation
            </Link>
          </Button>
        </div>
      </div>

      {/* Organisations */}
      <section className="mb-10">
        <h2 className="mb-4 text-base font-semibold text-muted-foreground uppercase tracking-wider text-xs">
          Organisations
        </h2>
        {!orgs || orgs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No organisations yet. Create one to start managing projects as a
                team.
              </p>
              <Button size="sm" asChild>
                <Link href="/org/new">
                  <Plus className="mr-2 h-4 w-4" /> Create organisation
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((org) => (
              <Link key={org.id} href={`/org/${org.slug}`} className="group">
                <Card className="transition-all hover:border-border hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{org.name}</CardTitle>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="text-xs text-muted-foreground">/{org.slug}</p>
                  </CardHeader>
                </Card>
              </Link>
            ))}
            <Link href="/org/new" className="group">
              <Card className="border-dashed transition-all hover:border-border">
                <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground group-hover:text-foreground">
                  <Plus className="h-4 w-4" /> New organisation
                </CardContent>
              </Card>
            </Link>
          </div>
        )}
      </section>

      {/* Recent Projects */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-muted-foreground uppercase tracking-wider text-xs">
          Recent Projects
        </h2>
        {projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        ) : !projects || projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <FolderGit2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No projects yet. Create an organisation and add your first
                project.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ project }: { project: AgentProjectListItem }) {
  return (
    <Card className="transition-all hover:border-border hover:shadow-md group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{project.name}</CardTitle>
          </div>
          <Badge
            variant={project.github_connected ? "default" : "secondary"}
            className="shrink-0 text-xs"
          >
            {project.github_connected ? "GitHub ✓" : "No GitHub"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground truncate">
          {project.github_repo_full_name ?? project.repo_path}
        </p>
        <p className="mt-1 text-xs text-muted-foreground capitalize">
          {project.language}
        </p>
      </CardContent>
    </Card>
  );
}
