"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export function GithubPrForm({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const pr = await api.createGithubPr({
        project_id: projectId,
        title,
        head,
        base,
        body: body || null,
      });
      const url = typeof pr.html_url === "string" ? pr.html_url : null;
      setMessage(url ? `Pull request created: ${url}` : "Pull request created.");
      setTitle("");
      setHead("");
      setBody("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create pull request</CardTitle>
        <CardDescription>Open a pull request from your selected branch.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pr-title">Title</Label>
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Upgrade dependency"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-head">Head branch</Label>
            <Input
              id="pr-head"
              value={head}
              onChange={(e) => setHead(e.target.value)}
              placeholder="chore/upgrade-foo"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-base">Base branch</Label>
            <Input id="pr-base" value={base} onChange={(e) => setBase(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pr-body">Body (optional)</Label>
            <Input
              id="pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what changed"
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create PR"}
          </Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
