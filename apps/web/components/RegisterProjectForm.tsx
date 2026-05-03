"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GithubConnectButton } from "@/components/GithubConnectButton";
import { api } from "@/lib/api";
import type { Language } from "@/lib/types";
import type { FormEvent } from "react";

const LANGUAGES: Language[] = ["python", "javascript", "typescript", "rust"];

export function RegisterProjectForm({
  orgId,
  orgSlug,
}: {
  orgId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [language, setLanguage] = useState<Language>("python");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreatedProjectId(null);
    try {
      const created = await api.createProject({ name, repo_path: repoPath, language, org_id: orgId });
      await mutate("/api/orgs");
      await mutate((key) => typeof key === "string" && key.startsWith(`/api/orgs/${orgSlug}`), undefined, {
        revalidate: true,
      });
      setName("");
      setRepoPath("");
      setLanguage("python");
      setCreatedProjectId(created.id);
      router.push(`/app/org/${orgSlug}/${created.id}/dashboard`);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Create project</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create a project</SheetTitle>
          <SheetDescription>
            Add a repo to this organization. The watcher, GitHub tools, and dashboard stay unchanged.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="frontend-app"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repo_path">Repo path</Label>
            <Input
              id="repo_path"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="/abs/path/to/repo"
              required
            />
            <p className="text-xs text-muted-foreground">
              Absolute path to the local clone on this machine.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {createdProjectId && (
            <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Project created. Connect GitHub to enable the repo browser and pull request actions.
              </p>
              <GithubConnectButton projectId={createdProjectId} />
            </div>
          )}
          <SheetFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setCreatedProjectId(null);
              }}
            >
              Done
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
