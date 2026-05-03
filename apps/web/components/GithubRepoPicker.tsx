"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { GithubRepoList } from "@/lib/types";

export function GithubRepoPicker({
  projectId,
  selectedRepo,
  onSelected,
}: {
  projectId: string;
  selectedRepo: string | null;
  onSelected: (repoFullName: string) => void;
}) {
  const [selected, setSelected] = useState<string>(selectedRepo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useSWR<GithubRepoList>(
    projectId ? `github-repos:${projectId}` : null,
    () => api.listGithubRepos(projectId)
  );

  const repos = useMemo(() => data?.repos ?? [], [data]);

  async function onSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.selectGithubRepo(projectId, selected);
      onSelected(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading repositories..." : "Select repository"} />
        </SelectTrigger>
        <SelectContent>
          {repos.map((repo) => (
            <SelectItem key={repo.full_name} value={repo.full_name}>
              {repo.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onSave} disabled={!selected || saving}>
        {saving ? "Saving..." : "Save repository"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

