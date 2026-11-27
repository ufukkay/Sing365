import "server-only";
import { GraphClient, syncTenant, type SyncResult } from "@sing365/graph";
import { getDb } from "./data";
import { env } from "./env";

/** Runs a directory sync for one tenant with the app's own credentials. */
export async function runSync(tenantId: string, entraTenantId: string, opts: { forceFull?: boolean } = {}): Promise<SyncResult | null> {
  const db = getDb();
  if (!db || !env.entraClientId || !env.entraClientSecret) return null;
  const graph = new GraphClient(entraTenantId, { clientId: env.entraClientId, clientSecret: env.entraClientSecret });
  return syncTenant(db, graph, tenantId, opts);
}
