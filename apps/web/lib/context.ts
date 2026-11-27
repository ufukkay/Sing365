import "server-only";
import { redirect } from "next/navigation";
import { dbConfigured, entraConfigured } from "./env";
import { SEED_TENANT_ID } from "./data";
import { readSession, type Session } from "./session";

export type PanelContext = { mode: "seed"; tenantId: string; session: null } | { mode: "live"; tenantId: string; session: Session };

/**
 * Which tenant the panel shows. With a database configured, a signed-in admin of a
 * consented tenant is required. Without DATABASE_URL (local demo) the seed tenant is shown.
 */
export async function requirePanel(): Promise<PanelContext> {
  if (!dbConfigured()) return { mode: "seed", tenantId: SEED_TENANT_ID, session: null };
  if (!entraConfigured()) redirect("/signin");
  const session = await readSession();
  if (!session) redirect("/signin");
  if (!session.tenantId) redirect("/onboarding");
  return { mode: "live", tenantId: session.tenantId, session };
}
