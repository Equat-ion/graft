import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { githubInstallation } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getInstallationOctokit } from "@/lib/sync/github";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

/**
 * Queries the GitHub App API to discover all current installations,
 * upserts them into the DB associated with the given org, and returns them.
 */
async function discoverAndSaveInstallations(orgId: string) {
  const privateKey = Buffer.from(
    process.env.GITHUB_APP_PRIVATE_KEY!,
    "base64"
  ).toString();

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey,
    },
  });

  const { data } = await appOctokit.rest.apps.listInstallations();
  console.log(
    `[api/github/repos] Discovered ${data.length} GitHub App installation(s)`
  );

  for (const install of data) {
    await db
      .insert(githubInstallation)
      .values({
        organizationId: orgId,
        installationId: install.id.toString(),
        accountLogin: install.account?.login ?? "unknown",
      })
      .onConflictDoUpdate({
        target: githubInstallation.installationId,
        set: {
          accountLogin: install.account?.login ?? "unknown",
          organizationId: orgId,
        },
      });
  }

  return db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.organizationId, orgId));
}

/**
 * GET /api/github/repos?orgId=xxx
 * Lists all repositories accessible to the organization via its GitHub App installations.
 * Auto-discovers installations from the GitHub API if none are found in the DB.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return new NextResponse("Missing orgId", { status: 400 });
  }

  // Fail fast if GitHub App credentials are not configured
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    console.error(
      "[api/github/repos] Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY env vars"
    );
    return NextResponse.json(
      {
        repos: [],
        error:
          "GitHub App is not fully configured. Missing GITHUB_APP_PRIVATE_KEY.",
      },
      { status: 500 }
    );
  }

  // 1. Check DB for existing installation records
  let installations = await db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.organizationId, orgId));

  // 2. If none found, auto-discover from the GitHub App API
  if (installations.length === 0) {
    console.log(
      `[api/github/repos] No installations in DB for org ${orgId}, discovering from GitHub API...`
    );
    try {
      installations = await discoverAndSaveInstallations(orgId);
    } catch (err) {
      console.error(
        "[api/github/repos] Failed to discover installations:",
        err
      );
      return NextResponse.json({
        repos: [],
        error:
          "Failed to discover GitHub App installations. Is the app installed on your GitHub account/organization?",
      });
    }

    if (installations.length === 0) {
      return NextResponse.json({
        repos: [],
        error:
          "No GitHub App installation found. Please install the GitHub App on your GitHub account or organization first.",
      });
    }
  }

  // 3. Fetch repos from each installation
  const allRepos = [];
  const errors: string[] = [];

  for (const install of installations) {
    try {
      const octokit = await getInstallationOctokit(install.installationId);
      const { data } =
        await octokit.rest.apps.listReposAccessibleToInstallation();

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
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[api/github/repos] Failed to fetch repos for installation ${install.installationId}:`,
        err
      );
      errors.push(`Installation ${install.accountLogin}: ${message}`);
    }
  }

  return NextResponse.json({
    repos: allRepos,
    ...(errors.length > 0 && { errors }),
  });
}

