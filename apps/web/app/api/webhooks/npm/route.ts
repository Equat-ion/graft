import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dependency as dependencyTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * POST /api/webhooks/npm
 * Receives npm registry hook payloads when a tracked package publishes a new version.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.NPM_HOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-npm-signature") ?? "";
    const body = await req.text();
    const expected = createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    const expectedBuf = Buffer.from(`sha256=${expected}`);
    const sigBuf = Buffer.from(sig);
    if (
      expectedBuf.length !== sigBuf.length ||
      !timingSafeEqual(expectedBuf, sigBuf)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = JSON.parse(body);
    return handlePayload(payload);
  }

  const payload = await req.json();
  return handlePayload(payload);
}

async function handlePayload(payload: Record<string, unknown>) {
  const name = payload.name as string | undefined;
  const version =
    (payload as { version?: string }).version ??
    ((payload as { "dist-tags"?: { latest?: string } })["dist-tags"]?.latest);

  if (!name || !version) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Find all dependencies tracking this package
  const deps = await db
    .select()
    .from(dependencyTable)
    .where(
      and(
        eq(dependencyTable.name, name),
        eq(dependencyTable.ecosystem, "npm")
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
    }
  }

  return NextResponse.json({ updated: deps.length });
}
