"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, FolderPlus, Layers3 } from "lucide-react";
import { RegisterProjectForm } from "@/components/RegisterProjectForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetcher } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export default function OrganizationPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const router = useRouter();
  const { data: org, error } = useSWR<Organization>(slug ? `/api/orgs/${slug}` : null, fetcher);

  if (error) {
    if (error.status === 401) {
      router.push("/login");
      return null;
    }
    return (
      <Card className="border-border/70 bg-card/70">
        <CardContent className="py-16 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load organization</p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!org) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link href="/app" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to organizations
        </Link>

        <Card className="border-border/70 bg-card/70 backdrop-blur">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Layers3 className="h-3.5 w-3.5 text-primary" />
                  Organization workspace
                </div>
                <h1 className="text-4xl font-black tracking-tight">{org.name}</h1>
                <p className="font-mono text-xs text-muted-foreground">/{org.slug}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Created</p>
                <p className="mt-1 text-sm font-medium">{formatRelative(org.created_at)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Projects</p>
                <p className="mt-2 text-sm font-medium">{org.projects.length} project{org.projects.length === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Path</p>
                <p className="mt-2 text-sm font-medium">/app/org/{org.slug}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <RegisterProjectForm orgId={org.id} orgSlug={org.slug} />
              <Button variant="outline" asChild>
                <Link href="/app">All organizations</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Projects in this org</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {org.projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/60 py-16 text-center">
              <FolderPlus className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Create the first project from this org workspace.</p>
            </div>
          ) : (
            org.projects.map((project) => (
              <Link
                key={project.id}
                href={`/app/org/${org.slug}/${project.id}/dashboard`}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/60 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div>
                  <p className="text-sm font-semibold">{project.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{project.repo_path}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
