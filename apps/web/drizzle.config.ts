import type { Config } from "drizzle-kit";

// Strip params that drizzle-kit's pg driver doesn't support
function cleanUrl(raw?: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw;
  }
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl(process.env.DATABASE_URL),
  },
} satisfies Config;
