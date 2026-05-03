import Link from "next/link";
import { ArrowRight, Boxes, Globe2, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Boxes,
    title: "Organizations first",
    description: "Create a workspace, name it with a slug, and keep projects grouped where your team expects them.",
  },
  {
    icon: LayoutDashboard,
    title: "Project dashboards",
    description: "Open a project dashboard inside the org path and keep the current dependency workflow unchanged.",
  },
  {
    icon: ShieldCheck,
    title: "No functionality drift",
    description: "GitHub auth, watcher runs, dependency checks, and project APIs keep working exactly as before.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_30%),radial-gradient(circle_at_left,hsl(155_60%_40%/0.14),transparent_28%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              New workspace flow: /, /login, /app, /app/org/[slug], /dashboard
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Graft becomes an org-first workspace for dependency automation.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Start with a simple landing page, sign in at <span className="font-mono text-foreground">/login</span>,
                create organizations at <span className="font-mono text-foreground">/app</span>, then open project dashboards
                under the org slug path. The agent behavior stays the same.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link href="/login">
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/app">Go to app</Link>
              </Button>
            </div>

            <div className="grid gap-4 pt-2 sm:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="border-border/70 bg-card/60 backdrop-blur">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-sm font-semibold">{feature.title}</h2>
                        <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-3xl" />
            <Card className="relative overflow-hidden border-border/70 bg-card/70 shadow-2xl backdrop-blur">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Flow</p>
                    <p className="mt-1 text-lg font-semibold">Simple navigation, clearer hierarchy</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Globe2 className="h-6 w-6" />
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: "1. Landing", value: "/" },
                    { label: "2. Auth", value: "/login" },
                    { label: "3. Org hub", value: "/app" },
                    { label: "4. Org workspace", value: "/app/org/[slug]" },
                    { label: "5. Project dashboard", value: "/app/org/[slug]/[projectId]/dashboard" },
                  ].map((step) => (
                    <div key={step.label} className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
                      <span className="text-sm text-muted-foreground">{step.label}</span>
                      <span className="font-mono text-xs text-foreground">{step.value}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-sm font-medium">What stays unchanged</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Project creation, GitHub connect, dependency checking, run history, and sandbox execution all continue
                    to use the existing backend APIs.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
