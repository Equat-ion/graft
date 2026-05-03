import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  project as projectTable,
  dependency as dependencyTable,
  updateJob,
  member,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/projects/[projectId]/jobs
 * Returns update jobs for a project with their dependency names.
 */
export async function GET(
  _req: NextRequest,
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

  // Join update_jobs with dependencies to get dep name and versions
  const rows = await db
    .select({
      id: updateJob.id,
      dependencyId: updateJob.dependencyId,
      agentJobId: updateJob.agentJobId,
      status: updateJob.status,
      prUrl: updateJob.prUrl,
      prNumber: updateJob.prNumber,
      triggeredAt: updateJob.triggeredAt,
      completedAt: updateJob.completedAt,
      depName: dependencyTable.name,
      ecosystem: dependencyTable.ecosystem,
      currentVersion: dependencyTable.currentVersion,
      latestVersion: dependencyTable.latestVersion,
    })
    .from(updateJob)
    .innerJoin(dependencyTable, eq(updateJob.dependencyId, dependencyTable.id))
    .where(eq(dependencyTable.projectId, projectId))
    .orderBy(desc(updateJob.triggeredAt));

  return NextResponse.json(rows);
}
