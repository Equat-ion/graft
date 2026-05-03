"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { Github, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");

  async function signInWith(provider: "google" | "github") {
    setPending(provider);
    setError("");
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: "/app",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setPending(null);
    }
  }

  const handleCredentialsSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("Credentials login is wired to the social providers for now.");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_28%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]" />
      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
        <div className="flex flex-col justify-between rounded-[2rem] border border-border/70 bg-card/55 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">Graft</p>
                <p className="text-xs text-muted-foreground">Workspace flow for orgs and projects</p>
              </div>
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back to landing</Link>
            </Button>
          </div>

          <div className="max-w-xl space-y-6 py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Access workspace
            </p>
            <h1 className="text-5xl font-black tracking-tight text-balance sm:text-6xl">
              Sign in, create an org, and move straight into the dashboard flow.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Choose login or sign up, then continue to <span className="font-mono text-foreground">/app</span> to create
              organizations and open project dashboards under the org slug path.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Login", "Use Google or GitHub to open the app."],
              ["Signup", "Create a new workspace account."],
              ["Org flow", "Create organizations and projects after auth."],
            ].map(([title, desc]) => (
              <Card key={title} className="border-border/70 bg-background/55">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center py-4 lg:py-10">
          <Card className="w-full max-w-[480px] border-border/70 bg-card/80 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Login or sign up
              </div>
              <CardTitle className="text-3xl font-black tracking-tight">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Use an existing identity to access your orgs and projects."
                  : "Start fresh and create your first organization in the app."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-background/70 p-1">
                <Button
                  type="button"
                  variant={mode === "login" ? "default" : "ghost"}
                  className="h-11 rounded-xl"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Login
                </Button>
                <Button
                  type="button"
                  variant={mode === "signup" ? "default" : "ghost"}
                  className="h-11 rounded-xl"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Sign up
                </Button>
              </div>

              {error && (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" type="text" placeholder="Ada Lovelace" className="h-11" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="agent@graft.dev" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" className="h-11" />
                </div>
                <Button type="submit" className="h-11 w-full">
                  {mode === "login" ? "Continue with credentials" : "Create account"}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 font-semibold text-muted-foreground">Or use social login</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-3 bg-background"
                  onClick={() => signInWith("google")}
                  disabled={pending !== null}
                >
                  {pending === "google" ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {mode === "login" ? "Continue with Google" : "Join with Google"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-3 bg-background"
                  onClick={() => signInWith("github")}
                  disabled={pending !== null}
                >
                  {pending === "github" ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Github className="h-4 w-4" />
                  )}
                  {mode === "login" ? "Continue with GitHub" : "Join with GitHub"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
