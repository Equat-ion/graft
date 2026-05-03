import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Graft — Dependency Lifecycle Management",
  description:
    "Keep your dependencies current automatically. Graft connects to GitHub, tracks every package version in real time, and dispatches an AI agent to open upgrade PRs so you never fall behind.",
  openGraph: {
    title: "Graft — Dependency Lifecycle Management",
    description:
      "Automated dependency upgrades powered by AI. Connect your GitHub repos and let Graft do the heavy lifting.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
