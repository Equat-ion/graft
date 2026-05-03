import { db } from "@/lib/db";
import {
  project as projectTable,
  dependency as dependencyTable,
  githubInstallation,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getInstallationOctokit } from "./github";

/**
 * Fetches the latest version of an npm package.
 */
async function fetchNpmLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version;
  } catch {
    return null;
  }
}

/**
 * Fetches the latest version of a PyPI package.
 */
async function fetchPyPiLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${name}/json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.info.version;
  } catch {
    return null;
  }
}

/**
 * Scans a project's repository for dependency manifests and populates the database.
 */
export async function syncProjectDependencies(projectId: string) {
  console.log(`[sync] Starting sync for project ${projectId}`);

  const [project] = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.id, projectId));

  if (!project || !project.githubInstallationId) {
    console.error(
      `[sync] Project ${projectId} not found or missing installation ID`
    );
    return;
  }

  const [installation] = await db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.id, project.githubInstallationId));

  if (!installation) {
    console.error(
      `[sync] GitHub installation not found for project ${projectId}`
    );
    return;
  }

  try {
    const octokit = await getInstallationOctokit(installation.installationId);

    const [owner, repo] = project.repoFullName.split("/");
    const branch = project.defaultBranch || "main";

    // 1. Fetch root tree to find manifests
    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
    });

    const manifestFiles = tree.tree.filter(
      (item) => item.path === "package.json" || item.path === "requirements.txt"
    );

    for (const manifestFile of manifestFiles) {
      console.log(`[sync] Parsing manifest: ${manifestFile.path}`);

      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: manifestFile.path!,
        ref: branch,
      });

      if (!("content" in fileData)) continue;

      const content = Buffer.from(fileData.content, "base64").toString();

      if (manifestFile.path === "package.json") {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, versionRange] of Object.entries(deps)) {
          const currentVersion = (versionRange as string).replace(/[\^~]/, "");
          const latestVersion = await fetchNpmLatest(name);
          const status =
            latestVersion && latestVersion !== currentVersion
              ? "outdated"
              : "up-to-date";

          await db
            .insert(dependencyTable)
            .values({
              projectId: project.id,
              name,
              ecosystem: "npm",
              currentVersion,
              latestVersion,
              manifestFile: "package.json",
              status,
              lastCheckedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                dependencyTable.projectId,
                dependencyTable.name,
                dependencyTable.manifestFile,
              ],
              set: {
                currentVersion,
                latestVersion,
                status,
                lastCheckedAt: new Date(),
                updatedAt: new Date(),
              },
            });
        }
      } else if (manifestFile.path === "requirements.txt") {
        const lines = content.split("\n");
        for (const line of lines) {
          const parts = line.split("==");
          if (parts.length === 2) {
            const name = parts[0].trim();
            const currentVersion = parts[1].trim();
            const latestVersion = await fetchPyPiLatest(name);
            const status =
              latestVersion && latestVersion !== currentVersion
                ? "outdated"
                : "up-to-date";

            await db
              .insert(dependencyTable)
              .values({
                projectId: project.id,
                name,
                ecosystem: "pypi",
                currentVersion,
                latestVersion,
                manifestFile: "requirements.txt",
                status,
                lastCheckedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  dependencyTable.projectId,
                  dependencyTable.name,
                  dependencyTable.manifestFile,
                ],
                set: {
                  currentVersion,
                  latestVersion,
                  status,
                  lastCheckedAt: new Date(),
                  updatedAt: new Date(),
                },
              });
          }
        }
      }
    }

    await db
      .update(projectTable)
      .set({ lastSyncedAt: new Date() })
      .where(eq(projectTable.id, projectId));

    console.log(`[sync] Completed sync for project ${projectId}`);
  } catch (err) {
    console.error(`[sync] Failed to sync project ${projectId}:`, err);
  }
}
