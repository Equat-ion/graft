"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { createAgentOrg } from "@/lib/agent-client";
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
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      // Create in BetterAuth (handles member tables)
      const { data, error } = await authClient.organization.create({
        name,
        slug: slug || slugify(name),
      });
      if (error) {
        toast.error(error.message ?? "Failed to create organisation");
        return;
      }
      // Mirror in the agent backend
      try {
        await createAgentOrg({ name, slug: slug || slugify(name) });
      } catch {
        // Non-fatal — org might already exist or agent is offline
      }
      toast.success("Organisation created!");
      router.push(`/org/${data?.slug}`);
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Create organisation</h1>
          <p className="text-sm text-muted-foreground">
            Organisations group projects and team members together.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisation details</CardTitle>
          <CardDescription>
            Choose a name and URL slug for your organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" id="form-new-org">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organisation name</Label>
              <Input
                id="org-name"
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-slug">URL slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  graft.dev/org/
                </span>
                <Input
                  id="org-slug"
                  placeholder="acme-corp"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  className="flex-1"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading} id="btn-create-org">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create organisation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
