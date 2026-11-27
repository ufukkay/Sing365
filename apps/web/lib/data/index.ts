import "server-only";
import { createDb, type Db } from "@sing365/db";
import { env } from "../env";
import { postgresData } from "./postgres";
import { seedData } from "./seed";
import type { DataLayer } from "./types";

export * from "./types";
export { SEED_TENANT_ID } from "./seed";

const g = globalThis as unknown as { __sing365db?: Db };

/** The shared Postgres pool, or null when DATABASE_URL is not set (seed mode). */
export function getDb(): Db | null {
  if (!env.databaseUrl) return null;
  g.__sing365db ??= createDb(env.databaseUrl);
  return g.__sing365db;
}

/** Postgres when DATABASE_URL is set, seed data otherwise (local demo). */
export const data: DataLayer = new Proxy({} as DataLayer, {
  get(_t, prop: keyof DataLayer) {
    const db = getDb();
    const impl = db ? postgresData(db) : seedData;
    const v = impl[prop];
    return typeof v === "function" ? v.bind(impl) : v;
  },
});
