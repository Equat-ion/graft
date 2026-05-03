"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function GithubConnectButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await api.githubOauthStart(projectId);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onConnect} disabled={loading}>
        {loading ? "Redirecting..." : "Connect GitHub"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

