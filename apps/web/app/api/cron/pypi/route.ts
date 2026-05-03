import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dependency as dependencyTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const PYPI_RSS = "https://pypi.org/rss/updates.xml";

/**
 * GET /api/cron/pypi
 * Polls PyPI RSS feed for new package releases and marks outdated dependencies.
 * Protected by CRON_SECRET header (set by Vercel Cron).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const res = await fetch(PYPI_RSS, {
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch PyPI RSS" }, { status: 502 });
  }

  const xml = await res.text();
  const now = Date.now();
  const fifteenMin = 15 * 60 * 1000;

  // Simple regex-based RSS item extraction
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

  let updatedCount = 0;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    const titleMatch = titleRegex.exec(itemContent);
    const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim();
    if (!title) continue;

    const pubDateMatch = pubDateRegex.exec(itemContent);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : null;

    // Only process items published in the last 15 minutes
    if (!pubDate || now - pubDate.getTime() > fifteenMin) continue;

    // PyPI RSS titles: "package-name 1.2.3"
    const parts = title.split(" ");
    if (parts.length < 2) continue;
    const pkgName = parts[0];
    const version = parts[parts.length - 1];

    const deps = await db
      .select()
      .from(dependencyTable)
      .where(
        and(
          eq(dependencyTable.name, pkgName),
          eq(dependencyTable.ecosystem, "pypi")
        )
      );

    for (const dep of deps) {
      if (dep.currentVersion !== version) {
        await db
          .update(dependencyTable)
          .set({
            latestVersion: version,
            status: "outdated",
            lastCheckedAt: new Date(),
          })
          .where(eq(dependencyTable.id, dep.id));
        updatedCount++;
      }
    }
  }

  return NextResponse.json({ ok: true, updatedDeps: updatedCount });
}
