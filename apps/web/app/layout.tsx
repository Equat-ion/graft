import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, LayoutDashboard, Boxes, Play } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graft",
  description: "Autonomous dependency-upgrade agent",
};

function SidebarLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="sidebar-bg fixed inset-y-0 left-0 z-20 flex w-56 flex-col">
            <div className="flex h-14 items-center gap-2.5 px-4 border-b border-[hsl(var(--sidebar-border))]">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20">
                <GitBranch className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold tracking-tight text-foreground">Graft</span>
            </div>
            <nav className="flex flex-col gap-1 p-3 flex-1">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Overview
              </p>
              <SidebarLink href="/" icon={LayoutDashboard}>
                Dashboard
              </SidebarLink>
              <p className="mt-3 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Monitor
              </p>
              <SidebarLink href="/runs" icon={Play}>
                Runs
              </SidebarLink>
            </nav>
            <div className="border-t border-[hsl(var(--sidebar-border))] px-4 py-3">
              <p className="text-[10px] text-muted-foreground/50">v0.1.0</p>
            </div>
          </aside>

          {/* Main */}
          <div className="flex flex-1 flex-col pl-56">
            <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-medium text-emerald-400">Agent online</span>
                </div>
              </div>
            </header>
            <main className="flex-1 px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
