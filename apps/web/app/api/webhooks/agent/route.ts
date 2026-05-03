import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dependency as dependencyTable, updateJob } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * POST /api/webhooks/agent
 * Receives job completion callbacks from the Graft FastAPI agent.
 * Secured via AGENT_WEBHOOK_SECRET header.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (secret) {
    const providedSecret = req.headers.get("x-agent-secret");
    if (!providedSecret || providedSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const { job_id, status, pr_url, pr_number, logs } = body;

  if (!job_id || !status) {
    return NextResponse.json({ error: "Missing job_id or status" }, { status: 400 });
  }

  // Find the update job
  const [job] = await db
    .select()
    .from(updateJob)
    .where(eq(updateJob.id, job_id))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Update job record
  await db
    .update(updateJob)
    .set({
      status: status as "queued" | "running" | "pr-open" | "failed" | "cancelled",
      prUrl: pr_url ?? null,
      prNumber: pr_number ?? null,
      agentLogs: logs ?? null,
      completedAt: new Date(),
    })
    .where(eq(updateJob.id, job_id));

  // Update linked dependency status
  const depStatus = status === "pr-open" ? "pr-open" : "failed";
  await db
    .update(dependencyTable)
    .set({ status: depStatus as "pr-open" | "failed" })
    .where(eq(dependencyTable.id, job.dependencyId));

  return NextResponse.json({ ok: true });
}
