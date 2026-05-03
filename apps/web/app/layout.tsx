import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppFrame } from "@/components/AppFrame";

export const metadata: Metadata = {
  title: "Graft",
  description: "Organizations, projects, and autonomous dependency upgrades",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
