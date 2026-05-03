import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { project as projectTable } from "@/lib/db/schema";
import { syncProjectDependencies } from "@/lib/sync/manifest";

/**
 * POST /api/projects
 * Creates a new project and triggers an initial manifest sync.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, organizationId, repoFullName, githubInstallationId } = body;

    if (!name || !organizationId || !repoFullName || !githubInstallationId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const [project] = await db
      .insert(projectTable)
      .values({
        name,
        organizationId,
        repoFullName,
        githubInstallationId,
      })
      .returning();

    // Trigger sync asynchronously
    syncProjectDependencies(project.id).catch((err) => {
      console.error(`[api/projects] Sync failed for project ${project.id}:`, err);
    });

    return NextResponse.json(project);
  } catch (err) {
    console.error("[api/projects] Create failed:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
