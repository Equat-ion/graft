"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { GitBranch, LayoutDashboard, Play, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      className={cn("justify-start gap-3 px-3", active && "shadow-sm")}
    >
      <Link href={href}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </Link>
    </Button>
  );
}

function routeTitle(pathname: string): string {
  if (pathname === "/app") return "Organizations";
  if (pathname.startsWith("/app/org/")) return "Organization";
  if (pathname.startsWith("/projects/")) return "Project";
  if (pathname.startsWith("/runs")) return "Runs";
  return "Workspace";
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === "/" || pathname === "/login" || pathname.startsWith("/oauth/");

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_36%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] text-foreground">
      <aside className="hidden w-72 flex-col border-r border-border/70 bg-card/60 backdrop-blur xl:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border/70 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Graft</p>
            <p className="text-xs text-muted-foreground">Organizations and projects</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 p-4">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Navigate
          </p>
          <NavItem href="/app" icon={LayoutDashboard} label="Organizations" active={pathname === "/app" || pathname.startsWith("/app/org/")} />
          <NavItem href="/runs" icon={Play} label="Runs" active={pathname.startsWith("/runs")} />

          <div className="mt-auto rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <Shield className="h-3.5 w-3.5" />
              Authenticated workspace
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Workspace data, GitHub connections, and agent runs stay exactly as they are.
            </p>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {routeTitle(pathname)}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {pathname.replace(/^\/+/, "/") || "/"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 sm:flex">
                Agent online
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
