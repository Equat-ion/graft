"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Boxes, FolderPlus, Sparkles } from "lucide-react";
import { CreateOrgSheet } from "@/components/CreateOrgSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetcher } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export default function AppHubPage() {
  const { data: orgs, error } = useSWR<Organization[]>("/api/orgs", fetcher);

  if (error) {
    return (
      <Card className="border-border/70 bg-card/70">
        <CardContent className="py-16 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load organizations</p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/app">Retry</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!orgs) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Organization hub
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Create an organization, then open it from the slug route.</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            This is the new authenticated starting point. Organizations live here, and projects stay inside
            <span className="font-mono text-foreground">/app/org/[slug]</span> so the structure stays simple.
          </p>
        </div>
        <CreateOrgSheet />
      </div>

      {orgs.length === 0 ? (
        <Card className="border-border/70 bg-card/70">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/15 text-primary">
              <FolderPlus className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold">No organizations yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Create the first org and use it as the workspace shell for all projects and dashboards.
            </p>
            <div className="mt-6">
              <CreateOrgSheet />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orgs.map((org) => (
            <Card key={org.id} className="border-border/70 bg-card/70 backdrop-blur">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-bold">{org.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">/{org.slug}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-3 text-right">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Projects</p>
                    <p className="mt-1 text-lg font-semibold">{org.projects.length}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {org.projects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      No projects yet. Open the org and create the first one.
                    </div>
                  ) : (
                    org.projects.slice(0, 3).map((project) => (
                      <Link
                        key={project.id}
                        href={`/app/org/${org.slug}/${project.id}/dashboard`}
                        className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/60 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div>
                          <p className="text-sm font-medium">{project.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatRelative(project.created_at)}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))
                  )}
                </div>
                <Button asChild className="w-full gap-2">
                  <Link href={`/app/org/${org.slug}`}>
                    Open organization
                    <Boxes className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
