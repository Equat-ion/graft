import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { githubInstallation, account, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getInstallationOctokit } from "@/lib/sync/github";

/**
 * Calls GitHub's user-scoped /user/installations endpoint with the user's own
 * OAuth token, so we only see installations they personally authorised.
 * Falls back gracefully if the user hasn't connected GitHub via OAuth.
 */
async function discoverUserInstallations(
  userId: string,
  orgId: string
): Promise<{ saved: boolean; error?: string }> {
  // Find the user's GitHub OAuth access token from the Better Auth account table
  const [githubAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")));

  if (!githubAccount?.accessToken) {
    return {
      saved: false,
      error:
        "No GitHub account connected. Sign in with GitHub or install the GitHub App directly.",
    };
  }

  const res = await fetch("https://api.github.com/user/installations", {
    headers: {
      Authorization: `Bearer ${githubAccount.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[api/github/repos] /user/installations failed (${res.status}): ${text}`
    );
    return {
      saved: false,
      error: "Failed to list your GitHub installations. Try reconnecting GitHub.",
    };
  }

  const data = await res.json();
  const installations: Array<{ id: number; account: { login: string } | null }> =
    data.installations ?? [];

  console.log(
    `[api/github/repos] Found ${installations.length} installation(s) for user ${userId}`
  );

  for (const install of installations) {
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

  return { saved: installations.length > 0 };
}

/**
 * GET /api/github/repos?orgId=xxx
 * Lists repositories accessible via the org's GitHub App installations.
 * Only discovers installations belonging to the currently logged-in user.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return new NextResponse("Missing orgId", { status: 400 });
  }

  // Verify the caller is a member of this org
  const [membership] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, orgId),
        eq(member.userId, session.user.id)
      )
    );

  if (!membership) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    return NextResponse.json(
      {
        repos: [],
        error:
          "GitHub App is not fully configured. Missing GITHUB_APP_PRIVATE_KEY.",
      },
      { status: 500 }
    );
  }

  // 1. Check DB for installations already linked to this org
  let installations = await db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.organizationId, orgId));

  // 2. If none found, attempt user-scoped discovery (NOT global app-level)
  if (installations.length === 0) {
    console.log(
      `[api/github/repos] No installations for org ${orgId}, trying user-scoped discovery...`
    );
    const result = await discoverUserInstallations(session.user.id, orgId);

    if (result.error && !result.saved) {
      return NextResponse.json({ repos: [], error: result.error });
    }

    installations = await db
      .select()
      .from(githubInstallation)
      .where(eq(githubInstallation.organizationId, orgId));

    if (installations.length === 0) {
      return NextResponse.json({
        repos: [],
        error:
          "No GitHub App installation found. Install the GitHub App on your account or organisation first.",
      });
    }
  }

  // 3. Fetch repos from each installation using the App's installation token
  const allRepos: Array<{
    id: number;
    full_name: string;
    default_branch: string;
    private: boolean;
    installationId: string;
  }> = [];
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
