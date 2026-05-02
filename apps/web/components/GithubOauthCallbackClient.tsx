"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function GithubOauthCallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Completing GitHub connection...");

  useEffect(() => {
    const codeParam = params.get("code");
    const stateParam = params.get("state");
    if (!codeParam || !stateParam) {
      setMessage("Missing GitHub OAuth callback parameters.");
      return;
    }

    const code = codeParam;
    const state = stateParam;
    let active = true;

    async function run() {
      try {
        await api.githubOauthCallback(code, state);
        if (!active) return;
        setMessage("GitHub connected. Redirecting...");
        router.replace(`/projects/${state}`);
      } catch (e) {
        if (!active) return;
        setMessage(e instanceof Error ? e.message : String(e));
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [params, router]);

  return <p className="text-sm text-muted-foreground">{message}</p>;
}
