"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Github, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState<"google" | "github" | "credentials" | null>(null);
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

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate error since credentials aren't fully hooked up in this demo
    setError("Invalid credentials or method not supported yet.");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left Column - Branding */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between bg-zinc-950 p-12 text-zinc-50 border-r border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-widest uppercase">Graft</span>
        </div>

        <div className="max-w-md space-y-8">
          <h1 className="text-5xl font-black uppercase leading-[1.1] tracking-tight">
            Sign In<br />To Your<br />Workspace
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Automated dependency upgrades, agent monitoring, and sandbox execution — all in one place.
          </p>
          <ul className="space-y-4 pt-4">
            <li className="flex items-center gap-3 text-zinc-300">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="text-sm">Autonomous agent tracking</span>
            </li>
            <li className="flex items-center gap-3 text-zinc-300">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="text-sm">Dependency upgrade monitoring</span>
            </li>
            <li className="flex items-center gap-3 text-zinc-300">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="text-sm">Sandbox execution logs</span>
            </li>
          </ul>
        </div>

        <div className="text-xs font-semibold tracking-wider text-zinc-600 uppercase">
          © 2025-2026 GRAFT. ALL RIGHTS RESERVED.
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex flex-1 flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32">
        <div className="mx-auto w-full max-w-[400px] space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tight">
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login" 
                ? "Enter your credentials to access your account." 
                : "Enter your details to create a new account."}
            </p>
          </div>

          {error && (
            <div className="p-3 text-sm font-medium rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ada Lovelace"
                  className="h-11 bg-muted/50"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="agent@graft.dev"
                className="h-11 bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="h-11 bg-muted/50"
              />
            </div>
            <Button type="submit" className="h-11 w-full font-bold uppercase tracking-wide">
              {mode === "login" ? "Sign In" : "Sign Up"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-4 font-bold text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border p-6 bg-muted/10 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Social {mode === "login" ? "Login" : "Sign Up"}
              </span>
            </div>
            
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 font-medium bg-background"
                onClick={() => signInWith("google")}
                disabled={pending !== null}
              >
                {pending === "google" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <GoogleIcon />
                )}
                {pending === "google" 
                  ? "Redirecting…" 
                  : mode === "login" ? "Sign In With Google" : "Sign Up With Google"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 font-medium bg-background"
                onClick={() => signInWith("github")}
                disabled={pending !== null}
              >
                {pending === "github" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Github className="h-4 w-4" />
                )}
                {pending === "github" 
                  ? "Redirecting…" 
                  : mode === "login" ? "Sign In With GitHub" : "Sign Up With GitHub"}
              </Button>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
