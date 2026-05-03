import { WebhookEvent } from "@octokit/webhooks-types";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  githubInstallation,
  project as projectTable,
  updateJob as updateJobTable,
  dependency as dependencyTable,
} from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import crypto from "crypto";
import { syncProjectDependencies } from "@/lib/sync/manifest";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-hub-signature-256") || "";
  const eventName = req.headers.get("x-github-event") || "";
  const id = req.headers.get("x-github-delivery") || "";

  const payloadText = await req.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET || "";

  if (!verifySignature(payloadText, signature, secret)) {
    console.warn("[github/webhook] Invalid signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(payloadText) as WebhookEvent;
  console.log(`[github/webhook] Received ${eventName} (delivery: ${id})`);

  try {
    switch (eventName) {
      case "installation":
        await handleInstallation(payload as any);
        break;
      case "installation_repositories":
        await handleInstallationRepositories(payload as any);
        break;
      case "repository":
        await handleRepository(payload as any);
        break;
      case "pull_request":
        await handlePullRequest(payload as any);
        break;
      case "push":
        await handlePush(payload as any);
        break;
      default:
        console.log(`[github/webhook] Unhandled event: ${eventName}`);
    }
  } catch (err) {
    console.error(`[github/webhook] Error handling ${eventName}:`, err);
  }

  return new NextResponse("OK", { status: 200 });
}

function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (err) {
    return false;
  }
}

async function handleInstallation(payload: any) {
  const { action, installation } = payload;
  const installationId = installation.id.toString();

  if (action === "deleted") {
    console.log(`[github/webhook] Installation ${installationId} deleted`);
    await db
      .delete(githubInstallation)
      .where(eq(githubInstallation.installationId, installationId));
  }
}

async function handleInstallationRepositories(payload: any) {
  const { action, installation, repositories_removed } = payload;
  const installationId = installation.id.toString();

  if (action === "removed" && repositories_removed?.length > 0) {
    const fullNames = repositories_removed.map((r: any) => r.full_name);
    console.log(
      `[github/webhook] Repositories removed from installation ${installationId}:`,
      fullNames
    );

    await db
      .delete(projectTable)
      .where(inArray(projectTable.repoFullName, fullNames));
  }
}

async function handleRepository(payload: any) {
  const { action, repository } = payload;
  if (action === "deleted" || action === "archived") {
    console.log(`[github/webhook] Repository ${repository.full_name} ${action}`);
    await db
      .delete(projectTable)
      .where(eq(projectTable.repoFullName, repository.full_name));
  } else if (action === "renamed") {
    const newName = repository.full_name;
    const oldName = `${repository.owner.login}/${payload.changes.repository.name.from}`;
    console.log(
      `[github/webhook] Repository renamed from ${oldName} to ${newName}`
    );
    await db
      .update(projectTable)
      .set({ repoFullName: newName })
      .where(eq(projectTable.repoFullName, oldName));
  }
}

async function handlePullRequest(payload: any) {
  const { action, pull_request, repository } = payload;
  const prUrl = pull_request.html_url;

  if (action === "closed") {
    const status = pull_request.merged ? "completed" : "cancelled";
    console.log(`[github/webhook] PR ${prUrl} closed (merged: ${pull_request.merged})`);

    // Update matching update jobs
    const updatedJobs = await db
      .update(updateJobTable)
      .set({
        status: status === "completed" ? "pr-open" : "failed", // pr-open means it was handled, we might need a 'merged' status in PRD
        completedAt: new Date(),
      })
      .where(eq(updateJobTable.prUrl, prUrl))
      .returning();

    // If merged, we should also trigger a re-sync of the project
    if (pull_request.merged) {
      const [project] = await db
        .select()
        .from(projectTable)
        .where(eq(projectTable.repoFullName, repository.full_name));

      if (project) {
        await syncProjectDependencies(project.id);
      }
    }
  }
}

async function handlePush(payload: any) {
  const { ref, repository } = payload;
  const [project] = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.repoFullName, repository.full_name));

  if (!project) return;

  const defaultBranchRef = `refs/heads/${project.defaultBranch || "main"}`;

  if (ref === defaultBranchRef) {
    console.log(
      `[github/webhook] Push to default branch of ${repository.full_name}, triggering sync`
    );
    await syncProjectDependencies(project.id);
  }
}
