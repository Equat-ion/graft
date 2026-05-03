import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { githubInstallation } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getInstallationOctokit } from "@/lib/sync/github";

/**
 * GET /api/github/repos?orgId=xxx
 * Lists all repositories accessible to the organization via its GitHub App installations.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return new NextResponse("Missing orgId", { status: 400 });
  }

  const installations = await db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.organizationId, orgId));

  const allRepos = [];

  for (const install of installations) {
    try {
      const octokit = await getInstallationOctokit(install.installationId);
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
      
      for (const repo of data.repositories) {
        allRepos.push({
          id: repo.id,
          full_name: repo.full_name,
          default_branch: repo.default_branch,
          private: repo.private,
          installationId: install.id,
        });
      }
    } catch (err) {
      console.error(`Failed to fetch repos for installation ${install.installationId}:`, err);
    }
  }

  return NextResponse.json({ repos: allRepos });
}
