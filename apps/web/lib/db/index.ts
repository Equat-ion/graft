import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// Required for @neondatabase/serverless Pool in Node.js (no native WebSocket)
neonConfig.webSocketConstructor = ws;

let _db: NeonDatabase<typeof schema> | null = null;

export function getDb() {
  if (!_db) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

/**
 * Lazy-initialised db instance.
 * Uses a Proxy so existing `import { db }` call-sites keep working without
 * any code changes, while deferring the Pool connection to first use
 * (i.e. request-time) instead of module-load time (build-time).
 */
export const db: NeonDatabase<typeof schema> = new Proxy(
  {} as NeonDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      const real = getDb();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === "function" ? value.bind(real) : value;
    },
  }
);

export * from "./schema";

