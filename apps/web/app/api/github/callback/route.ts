import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  githubInstallation,
  organization as organizationTable,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAppAuth } from "@octokit/auth-app";

/**
 * GET /api/github/callback?installation_id=xxx&setup_action=install&state=orgId
 * Stores the GitHub App installation and redirects back to the project creation flow.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session) {
    console.warn("[github/callback] No session found");
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const installationId = searchParams.get("installation_id");
  const orgId = searchParams.get("state"); // we pass orgId as state

  console.log(`[github/callback] installationId=${installationId}, orgId=${orgId}`);

  if (!installationId) {
    return NextResponse.redirect(
      new URL("/dashboard?error=missing_installation_id", req.url)
    );
  }

  // Fetch the installation account login from GitHub App API
  let accountLogin = "unknown";
  try {
    if (
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY
    ) {
      const appAuth = createAppAuth({
        appId: process.env.GITHUB_APP_ID,
        privateKey: Buffer.from(
          process.env.GITHUB_APP_PRIVATE_KEY,
          "base64"
        ).toString(),
        clientId: process.env.GITHUB_APP_CLIENT_ID,
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
      });
      const installAuth = await appAuth({
        type: "installation",
        installationId: Number(installationId),
      });
      // Fetch installation details
      const res = await fetch(
        `https://api.github.com/app/installations/${installationId}`,
        {
          headers: {
            Authorization: `Bearer ${installAuth.token}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        accountLogin = data?.account?.login ?? "unknown";
      }
    }
  } catch (err) {
    console.error("[github/callback] Failed to fetch installation details:", err);
  }

  const targetOrgId = orgId ?? session.user.id;

  // Upsert the installation record
  await db
    .insert(githubInstallation)
    .values({
      organizationId: targetOrgId,
      installationId: installationId,
      accountLogin,
    })
    .onConflictDoUpdate({
      target: githubInstallation.installationId,
      set: { accountLogin, organizationId: targetOrgId },
    });

  // Fetch org slug for a better redirect
  let redirect = "/dashboard?connected=true";
  if (orgId) {
    const [org] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, orgId));
    
    if (org) {
      // Redirect back to the project creation page so they can pick a repo
      redirect = `/org/${org.slug}/projects/new?connected=true`;
    }
  }

  console.log(`[github/callback] Redirecting to ${redirect}`);
  return NextResponse.redirect(new URL(redirect, req.url));
}
