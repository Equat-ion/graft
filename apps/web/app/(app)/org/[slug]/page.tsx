"use client";

import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useListOrganizations } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GithubIcon } from "@/components/icons";
import {
  FolderGit2,
  GitBranch,
  Plus,
  Settings,
  Loader2,
  ArrowRight,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface FrontendProject {
  id: string;
  name: string;
  repoFullName: string;
  defaultBranch: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export default function OrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const { data: orgs, isPending: orgsLoading } = useListOrganizations();
  const org = orgs?.find((o) => o.slug === slug);

  const { data: projects, isLoading: projectsLoading } = useSWR<
    FrontendProject[]
  >(org?.id ? `/api/projects?orgId=${org.id}` : null, fetcher);

  if (orgsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 text-center">
        <p className="text-muted-foreground">Organisation not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">/{org.slug}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/org/${slug}/settings`}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={`/org/${slug}/projects/new`}>
              <Plus className="mr-2 h-4 w-4" /> New project
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="projects">
        <TabsList className="mb-6">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
        </TabsList>

        {/* Projects tab */}
        <TabsContent value="projects">
          {projectsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !projects || projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <FolderGit2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No projects yet. Connect GitHub and create your first project.
                </p>
                <Button size="sm" asChild>
                  <Link href={`/org/${slug}/projects/new`}>
                    <Plus className="mr-2 h-4 w-4" /> New project
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <OrgProjectCard key={p.id} project={p} orgSlug={slug} />
              ))}
              <Link href={`/org/${slug}/projects/new`} className="group">
                <Card className="border-dashed transition-all hover:border-border h-full">
                  <CardContent className="flex h-full items-center justify-center gap-2 py-8 text-sm text-muted-foreground group-hover:text-foreground">
                    <Plus className="h-4 w-4" /> New project
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* GitHub tab */}
        <TabsContent value="github">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GithubIcon className="h-4 w-4" /> GitHub App Installation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Install the Graft GitHub App on your organisation to allow
                Graft to read repositories and open pull requests.
              </p>
              <Button asChild>
                <a
                  href={`https://github.com/apps/${
                    process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "graft-app"
                  }/installations/new?state=${org.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="btn-install-github"
                >
                  <GithubIcon className="mr-2 h-4 w-4" /> Install GitHub App
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgProjectCard({
  project,
  orgSlug,
}: {
  project: FrontendProject;
  orgSlug: string;
}) {
  return (
    <Link href={`/org/${orgSlug}/projects/${project.id}`} className="group">
      <Card className="h-full transition-all hover:border-border hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {project.name}
              </CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
            {project.repoFullName}
          </p>
          <Badge variant="outline" className="text-xs shrink-0">
            <GithubIcon className="mr-1 h-3 w-3" />
            GitHub
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
