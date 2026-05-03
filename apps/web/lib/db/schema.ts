import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  integer,
  real,
  json,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── BetterAuth managed tables ────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  linkedGithubRepos: text("linked_github_repos").default("[]"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});

// ── BetterAuth Organisation plugin ───────────────────────────────────────────

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// ── Graft domain tables ───────────────────────────────────────────────────────

export const githubInstallation = pgTable("github_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  installationId: text("installation_id").notNull().unique(),
  accountLogin: text("account_login").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const ecosystemEnum = pgEnum("ecosystem", ["npm", "pypi"]);
export const depStatusEnum = pgEnum("dep_status", [
  "up-to-date",
  "outdated",
  "pr-open",
  "failed",
  "ignored",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "pr-open",
  "failed",
  "cancelled",
]);

export const project = pgTable("projects_graft", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  githubInstallationId: uuid("github_installation_id").references(
    () => githubInstallation.id,
    { onDelete: "set null" }
  ),
  repoFullName: text("repo_full_name").notNull(),
  name: text("name").notNull(),
  defaultBranch: text("default_branch").default("main"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const dependency = pgTable(
  "dependencies_graft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ecosystem: ecosystemEnum("ecosystem").notNull(),
    currentVersion: text("current_version").notNull(),
    latestVersion: text("latest_version"),
    status: depStatusEnum("status").notNull().default("up-to-date"),
    manifestFile: text("manifest_file").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => {
    return {
      dependencyUniqueIdx: uniqueIndex("dependency_unique_idx").on(
        table.projectId,
        table.name,
        table.manifestFile
      ),
    };
  }
);

export const updateJob = pgTable("update_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  dependencyId: uuid("dependency_id")
    .notNull()
    .references(() => dependency.id, { onDelete: "cascade" }),
  agentJobId: text("agent_job_id"),
  status: jobStatusEnum("status").notNull().default("queued"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  agentLogs: text("agent_logs"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const notification = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
