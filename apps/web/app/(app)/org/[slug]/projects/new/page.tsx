"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useListOrganizations } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GithubIcon } from "@/components/icons";
import { FolderGit2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function NewProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: orgs, isPending: orgsLoading } = useListOrganizations();
  const org = orgs?.find((o) => o.slug === slug);

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch repositories from connected installations
  const { data: reposData, isLoading: reposLoading } = useSWR(
    org?.id ? `/api/github/repos?orgId=${org.id}` : null,
    (url) => fetch(url).then((res) => res.json())
  );

  const repos = reposData?.repos || [];
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!org?.id || !selectedRepoFullName) return;

    const selectedRepo = repos.find((r: any) => r.full_name === selectedRepoFullName);
    if (!selectedRepo) return;

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          organizationId: org.id,
          repoFullName: selectedRepo.full_name,
          githubInstallationId: selectedRepo.installationId,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const project = await res.json();
      toast.success("Project created! Syncing dependencies...");
      router.push(`/org/${slug}/projects/${project.id}`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  if (orgsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FolderGit2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">New project</h1>
          <p className="text-sm text-muted-foreground">in {org?.name ?? slug}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
          <CardDescription>
            Name your project and select a GitHub repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                placeholder="My API"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="repo-select">Repository</Label>
              {reposLoading ? (
                <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading repositories...
                </div>
              ) : reposData?.error && repos.length === 0 ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-center">
                  <p className="mb-3 text-xs text-destructive">
                    {reposData.error}
                  </p>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a
                      href={`https://github.com/apps/${
                        process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "graft-app"
                      }/installations/new?state=${org?.id}`}
                    >
                      <GithubIcon className="mr-2 h-4 w-4" /> Install GitHub App
                    </a>
                  </Button>
                </div>
              ) : repos.length > 0 ? (
                <Select
                  value={selectedRepoFullName}
                  onValueChange={(val) => setSelectedRepoFullName(val || "")}
                >
                  <SelectTrigger id="repo-select">
                    <SelectValue placeholder="Choose a repository..." />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((r: any) => (
                      <SelectItem key={r.full_name} value={r.full_name}>
                        {r.full_name} {r.private ? "🔒" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-center">
                  <p className="mb-3 text-xs text-muted-foreground">
                    No repositories found. Connect your GitHub account or
                    organization.
                  </p>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a
                      href={`https://github.com/apps/${
                        process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "graft-app"
                      }/installations/new?state=${org?.id}`}
                    >
                      <GithubIcon className="mr-2 h-4 w-4" /> Install GitHub App
                    </a>
                  </Button>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !selectedRepoFullName}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create project
            </Button>

            {repos.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Don&apos;t see your repo?{" "}
                <a
                  href={`https://github.com/apps/${
                    process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "graft-app"
                  }/installations/new?state=${org?.id}`}
                  className="underline hover:text-foreground"
                >
                  Configure GitHub App
                </a>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
