import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  project as projectTable,
  dependency as dependencyTable,
  updateJob,
  githubInstallation,
  member,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/projects/[projectId]/trigger
 * Body: { depId: string }
 *
 * Creates an update_job record and fires the agent backend to clone the repo,
 * upgrade the dependency, and open a PR.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { projectId } = await params;

  const [project] = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.id, projectId));

  if (!project) return new NextResponse("Not Found", { status: 404 });

  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, project.organizationId),
        eq(member.userId, session.user.id)
      )
    );
  if (!membership) return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json();
  const { depId } = body;
  if (!depId) return new NextResponse("Missing depId", { status: 400 });

  const [dep] = await db
    .select()
    .from(dependencyTable)
    .where(
      and(
        eq(dependencyTable.id, depId),
        eq(dependencyTable.projectId, projectId)
      )
    );

  if (!dep) return new NextResponse("Dependency not found", { status: 404 });
  if (!dep.latestVersion || dep.latestVersion === dep.currentVersion) {
    return new NextResponse("Dependency is already up to date", { status: 409 });
  }

  // Look up the installation for the GitHub token
  const [installation] = project.githubInstallationId
    ? await db
        .select()
        .from(githubInstallation)
        .where(eq(githubInstallation.id, project.githubInstallationId))
    : [null];

  // Create the update job (queued)
  const [job] = await db
    .insert(updateJob)
    .values({ dependencyId: dep.id, status: "queued" })
    .returning();

  // Fire-and-forget call to the agent backend
  const agentUrl =
    process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000";
  const webhookUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") +
    "/api/webhooks/agent";

  fetch(`${agentUrl}/api/agent/github-trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AGENT_WEBHOOK_SECRET
        ? { "x-agent-secret": process.env.AGENT_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify({
      job_id: job.id,
      project_id: projectId,
      project_name: project.name,
      repo_full_name: project.repoFullName,
      default_branch: project.defaultBranch ?? "main",
      installation_id: installation?.installationId ?? null,
      dep_name: dep.name,
      dep_ecosystem: dep.ecosystem,
      from_version: dep.currentVersion,
      to_version: dep.latestVersion,
      user_id: session.user.id,
      webhook_url: webhookUrl,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          `[trigger] Agent backend returned ${res.status}: ${text}`
        );
        await db
          .update(updateJob)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(updateJob.id, job.id));
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.run_id) {
          await db
            .update(updateJob)
            .set({ status: "running", agentJobId: data.run_id })
            .where(eq(updateJob.id, job.id));
        }
      }
    })
    .catch(async (err) => {
      console.error("[trigger] Failed to reach agent backend:", err);
      await db
        .update(updateJob)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(updateJob.id, job.id));
    });

  return NextResponse.json({ jobId: job.id, status: "queued" });
}
