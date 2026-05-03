import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GithubIcon } from "@/components/icons";
import {
  GitBranch,
  Zap,
  ShieldCheck,
  BarChart3,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold tracking-tight">Graft</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-32 text-center">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <Badge variant="secondary" className="mb-6 gap-1.5">
          <Zap className="h-3 w-3" />
          AI-powered dependency upgrades
        </Badge>

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Dependency upgrades,{" "}
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            fully automated
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Graft connects to your GitHub repos, tracks every package version in
          real time, and dispatches an AI agent to open upgrade PRs — so your
          team ships with confidence, not tech debt.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" className="gap-2" asChild>
            <Link href="/auth/signup">
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon className="h-4 w-4" /> View on GitHub
            </a>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40 py-24 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything your team needs
            </h2>
            <p className="mt-4 text-muted-foreground">
              From detection to a merged PR — all in one platform.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border/50 bg-card p-6 hover:border-border transition-colors"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-border/40 py-24 px-6 bg-muted/30"
      >
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-4 text-muted-foreground">
            Four steps from setup to automated PRs.
          </p>

          <ol className="mt-12 space-y-8 text-left">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 py-24 px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Ready to keep your deps current?
        </h2>
        <p className="mt-4 text-muted-foreground">
          Create your account and connect your first repo in minutes.
        </p>
        <Button size="lg" className="mt-8 gap-2" asChild>
          <Link href="/auth/signup">
            Start for free <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Graft. Built with Next.js &amp; BetterAuth.
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: GitBranch,
    title: "GitHub App Integration",
    description:
      "Connect your organisations GitHub installation with a single click. Graft reads your repo tree and parses all manifest files automatically.",
  },
  {
    icon: Zap,
    title: "Real-time Version Tracking",
    description:
      "npm webhooks and a 10-minute PyPI RSS poller ensure you know about new releases within minutes — not days.",
  },
  {
    icon: ShieldCheck,
    title: "AI-powered Upgrade Agent",
    description:
      "When a dependency falls behind, an AI agent clones your repo, applies the upgrade, runs your test suite, and opens a PR.",
  },
  {
    icon: BarChart3,
    title: "Dependency Dashboard",
    description:
      "A single dashboard shows every dependency across all projects, colour-coded by status, with direct links to PRs.",
  },
  {
    icon: GitBranch,
    title: "Multi-tenant Organisations",
    description:
      "Invite your whole team to a shared organisation. Role-based access keeps admins in control.",
  },
  {
    icon: Zap,
    title: "Email Notifications",
    description:
      "Get notified when a PR is opened or an upgrade fails — directly in your inbox via Resend.",
  },
];

const STEPS = [
  {
    title: "Connect GitHub",
    description:
      "Install the Graft GitHub App on your organisation and select the repos you want to monitor.",
  },
  {
    title: "Create a project",
    description:
      "Link a repo to a Graft project. Graft scans your manifest files and seeds your dependency table instantly.",
  },
  {
    title: "Watch Graft track versions",
    description:
      "Sit back as npm webhooks and PyPI polling keep every dependency's latest version up to date.",
  },
  {
    title: "Review AI-opened PRs",
    description:
      "When something goes outdated, the AI agent applies the upgrade, runs tests, and opens a PR. You just review and merge.",
  },
];
