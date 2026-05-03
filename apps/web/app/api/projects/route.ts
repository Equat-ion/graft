import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project as projectTable, member } from "@/lib/db/schema";
import { syncProjectDependencies } from "@/lib/sync/manifest";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/projects?orgId=xxx
 * Lists frontend DB projects for an organisation (caller must be a member).
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return new NextResponse("Missing orgId", { status: 400 });

  // Verify membership
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(eq(member.organizationId, orgId), eq(member.userId, session.user.id))
    );
  if (!membership) return new NextResponse("Forbidden", { status: 403 });

  const projects = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.organizationId, orgId));

  return NextResponse.json(projects);
}

/**
 * POST /api/projects
 * Creates a new project and triggers an initial manifest sync.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { name, organizationId, repoFullName, githubInstallationId } = body;

    if (!name || !organizationId || !repoFullName || !githubInstallationId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Verify the caller is a member of this org
    const [membership] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, session.user.id)
        )
      );
    if (!membership) return new NextResponse("Forbidden", { status: 403 });

    const [project] = await db
      .insert(projectTable)
      .values({
        name,
        organizationId,
        repoFullName,
        githubInstallationId,
      })
      .returning();

    syncProjectDependencies(project.id).catch((err) => {
      console.error(`[api/projects] Sync failed for project ${project.id}:`, err);
    });

    return NextResponse.json(project);
  } catch (err) {
    console.error("[api/projects] Create failed:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
