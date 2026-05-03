import { db } from "@/lib/db";
import {
  project as projectTable,
  dependency as dependencyTable,
  githubInstallation,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getInstallationOctokit } from "./github";

async function fetchNpmLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

async function fetchPyPiLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${name}/json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.info?.version ?? null;
  } catch {
    return null;
  }
}

// ── Manifest parsers ──────────────────────────────────────────────────────────

interface ParsedDep {
  name: string;
  version: string;
  ecosystem: "npm" | "pypi";
  manifestFile: string;
}

function parsePackageJson(content: string, manifestFile: string): ParsedDep[] {
  try {
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.entries(deps).map(([name, versionRange]) => ({
      name,
      version: (versionRange as string).replace(/^[\^~>=<]/, "").split(",")[0].trim(),
      ecosystem: "npm" as const,
      manifestFile,
    }));
  } catch {
    return [];
  }
}

function parseRequirementsTxt(content: string, manifestFile: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    // Handle: requests==2.28.0  or  requests>=2.0,<3
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*[=><!~]+\s*([^\s,;]+)/);
    if (match) {
      deps.push({
        name: match[1].toLowerCase(),
        version: match[2].replace(/[^0-9.]/g, "").replace(/\.$/, "") || match[2],
        ecosystem: "pypi",
        manifestFile,
      });
    }
  }
  return deps;
}

/**
 * Simple section-aware TOML reader — returns the raw lines for a section.
 * Handles both [section] and [section.subsection] headers.
 */
function tomlSection(content: string, header: string): string[] {
  const lines = content.split("\n");
  const headerPattern = `[${header}]`;
  let inSection = false;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === headerPattern) {
      inSection = true;
      continue;
    }
    // New top-level or sub-section header
    if (inSection && trimmed.startsWith("[") && !trimmed.startsWith("[[")) {
      break;
    }
    if (inSection) out.push(line);
  }
  return out;
}

function parsePyprojectToml(content: string, manifestFile: string): ParsedDep[] {
  const deps: ParsedDep[] = [];

  // PEP 621: [project] section, dependencies = ["package>=1.0", ...]
  const projectLines = tomlSection(content, "project");
  const pep621Block = projectLines.join("\n");
  const depArrayMatch = pep621Block.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depArrayMatch) {
    for (const item of depArrayMatch[1].split(",")) {
      const raw = item.replace(/["'\s]/g, "");
      if (!raw) continue;
      // "requests>=2.28" or "click~=8.0" or "flask>=2.0,<3"
      const m = raw.match(/^([A-Za-z0-9_.\-]+)([><=!~].*)?$/);
      if (m) {
        const versionStr = m[2] ?? "";
        const version = versionStr.replace(/^[><=!~]+/, "").split(",")[0] || "0";
        deps.push({
          name: m[1].toLowerCase().replace(/-/g, "_"),
          version: version.replace(/[^0-9.]/g, "").replace(/\.$/, "") || version,
          ecosystem: "pypi",
          manifestFile,
        });
      }
    }
  }

  // Poetry: [tool.poetry.dependencies] section  key = "^1.0" or key = {version = "^1.0"}
  const poetryLines = tomlSection(content, "tool.poetry.dependencies");
  for (const line of poetryLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Skip the python version constraint
    const kvMatch = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*=\s*(.+)$/);
    if (!kvMatch) continue;
    const pkgName = kvMatch[1].toLowerCase().replace(/-/g, "_");
    if (pkgName === "python") continue;
    let rawVersion = kvMatch[2].trim();
    // Inline table: {version = "^1.0", ...}
    const inlineVersion = rawVersion.match(/version\s*=\s*["']([^"']+)["']/);
    if (inlineVersion) rawVersion = inlineVersion[1];
    // Strip quotes and leading specifiers
    rawVersion = rawVersion.replace(/["']/g, "").replace(/^[\^~>=<]+/, "");
    const version = rawVersion.split(",")[0].trim();
    if (!version) continue;
    deps.push({
      name: pkgName,
      version: version.replace(/[^0-9.]/g, "").replace(/\.$/, "") || version,
      ecosystem: "pypi",
      manifestFile,
    });
  }

  return deps;
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function upsertDep(
  projectId: string,
  dep: ParsedDep,
  latestVersion: string | null
) {
  const status =
    latestVersion && latestVersion !== dep.version ? "outdated" : "up-to-date";

  await db
    .insert(dependencyTable)
    .values({
      projectId,
      name: dep.name,
      ecosystem: dep.ecosystem,
      currentVersion: dep.version,
      latestVersion,
      manifestFile: dep.manifestFile,
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
        currentVersion: dep.version,
        latestVersion,
        status,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

// ── Main sync entry point ─────────────────────────────────────────────────────

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

    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });

    const MANIFEST_FILES = [
      "package.json",
      "requirements.txt",
      "requirements-dev.txt",
      "requirements-test.txt",
      "pyproject.toml",
    ];

    const manifestEntries = tree.tree.filter(
      (item) => item.path && MANIFEST_FILES.includes(item.path)
    );

    for (const entry of manifestEntries) {
      const filePath = entry.path!;
      console.log(`[sync] Parsing manifest: ${filePath}`);

      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      });

      if (!("content" in fileData)) continue;
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");

      let parsed: ParsedDep[] = [];
      if (filePath === "package.json") {
        parsed = parsePackageJson(content, filePath);
      } else if (filePath.startsWith("requirements")) {
        parsed = parseRequirementsTxt(content, filePath);
      } else if (filePath === "pyproject.toml") {
        parsed = parsePyprojectToml(content, filePath);
      }

      for (const dep of parsed) {
        const latest =
          dep.ecosystem === "npm"
            ? await fetchNpmLatest(dep.name)
            : await fetchPyPiLatest(dep.name);
        await upsertDep(projectId, dep, latest);
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
