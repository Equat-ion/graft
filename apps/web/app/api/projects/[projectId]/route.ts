import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  project as projectTable,
  dependency as dependencyTable,
  member,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/projects/[projectId]
 * Returns a frontend DB project with its dependencies.
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

  // Verify caller is a member of the project's org
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

  const deps = await db
    .select()
    .from(dependencyTable)
    .where(eq(dependencyTable.projectId, projectId));

  return NextResponse.json({ ...project, dependencies: deps });
}

/**
 * DELETE /api/projects/[projectId]
 * Deletes a project (cascade deletes deps and jobs via FK).
 */
export async function DELETE(
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

  await db.delete(projectTable).where(eq(projectTable.id, projectId));

  return new NextResponse(null, { status: 204 });
}
