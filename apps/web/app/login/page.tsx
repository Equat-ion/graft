"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");

  async function signInWith(provider: "google" | "github") {
    setPending(provider);
    setError("");
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: "/",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center justify-center space-y-2 text-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="font-bold text-primary-foreground">G</span>
            </div>
            <span className="text-xl font-bold tracking-tight">Graft</span>
          </Link>
          <p className="text-sm text-muted-foreground">
            Autonomous dependency-upgrade agent
          </p>
        </div>

        <Card className="shadow-none border border-white/[0.07] bg-card/50">
          <CardHeader className="pb-6">
            <CardDescription className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Welcome
            </CardDescription>
            <CardTitle className="text-2xl font-medium tracking-tight mt-1">
              Sign in to Graft
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <div className="p-3 text-sm font-medium rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                {error}
              </div>
            )}

            <Button
              id="signin-google"
              variant="outline"
              className="w-full h-11 gap-3 border-white/[0.10] bg-background/50 hover:bg-white/5 font-medium transition-all"
              onClick={() => signInWith("google")}
              disabled={pending !== null}
            >
              {pending === "google" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <GoogleIcon />
              )}
              {pending === "google" ? "Redirecting…" : "Continue with Google"}
            </Button>

            <Button
              id="signin-github"
              variant="outline"
              className="w-full h-11 gap-3 border-white/[0.10] bg-background/50 hover:bg-white/5 font-medium transition-all"
              onClick={() => signInWith("github")}
              disabled={pending !== null}
            >
              {pending === "github" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Github className="h-4 w-4" />
              )}
              {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
            </Button>

            <p className="pt-2 text-center text-[11px] text-muted-foreground leading-relaxed">
              By continuing, you agree to Graft&apos;s{" "}
              <Link href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
