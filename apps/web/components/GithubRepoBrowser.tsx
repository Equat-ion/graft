"use client";

import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { GithubRepoTree } from "@/lib/types";

export function GithubRepoBrowser({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useSWR<GithubRepoTree>(
    projectId ? `github-tree:${projectId}` : null,
    () => api.getGithubRepoTree(projectId)
  );

  const files = data?.tree ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repository tree</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading repository files..."
            : `${files.length} entries from the selected repository.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-destructive">{error.message}</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files returned yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-auto rounded-md border p-3 font-mono text-xs">
            {files.map((node) => (
              <li key={`${node.path}:${node.sha}`}>{node.path}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
