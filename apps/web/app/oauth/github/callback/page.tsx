import { Suspense } from "react";
import { GithubOauthCallbackClient } from "@/components/GithubOauthCallbackClient";

export default function GithubOauthCallbackPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Completing GitHub connection...</p>}>
      <GithubOauthCallbackClient />
    </Suspense>
  );
}
