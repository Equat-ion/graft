"use client";

import { useState } from "react";
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

const LANGUAGES: Language[] = ["python", "javascript", "typescript", "rust"];

export function RegisterProjectForm() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [language, setLanguage] = useState<Language>("python");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreatedProjectId(null);
    try {
      const created = await api.createProject({ name, repo_path: repoPath, language });
      await mutate("/api/projects");
      setName("");
      setRepoPath("");
      setLanguage("python");
      setCreatedProjectId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Register project</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Register a project</SheetTitle>
          <SheetDescription>
            Point Graft at a local clone. The watcher will start polling its dependencies.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repo_path">Repo path</Label>
            <Input
              id="repo_path"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/abs/path/to/repo"
              required
            />
            <p className="text-xs text-muted-foreground">
              Absolute path to the local clone on this machine.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
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
                Project created. Connect GitHub now to enable repo browser and pull request actions.
              </p>
              <GithubConnectButton projectId={createdProjectId} />
            </div>
          )}
          <SheetFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
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
