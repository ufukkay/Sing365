import "server-only";
import { data, SEED_TENANT_ID } from "./data";
import { verifyEntraToken } from "./entra";
import { env } from "./env";

export interface AddinCaller {
  tenantId: string;
  /** The signed-in mailbox owner. */
  email: string;
}

/**
 * Who is calling the add-in API.
 *
 * Production: the add-in sends an Office SSO access token. It must be signed by
 * Entra, issued for Sing365 (aud = our client id or Application ID URI), and
 * come from a tenant that has consented. The From address may be the caller's
 * own or another mailbox of the same tenant (send-as / shared mailbox); the
 * signature only contains directory data that tenant members can already see.
 *
 * Local development: SING365_DEV_AUTH=1 (never in production) trusts `from`
 * against the seed tenant.
 */
export async function authenticateAddin(req: Request, from: string): Promise<AddinCaller | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && env.entraClientId) {
    try {
      const audience = [env.entraClientId, env.entraApiAudience].filter(Boolean);
      const claims = await verifyEntraToken(token, { audience });
      const tenant = await data.getTenantByEntraId(claims.tid);
      if (!tenant || tenant.consentStatus !== "granted") return null;
      return { tenantId: tenant.id, email: (claims.preferred_username ?? claims.email ?? "").toLowerCase() };
    } catch {
      return null;
    }
  }
  if (env.devAuth) return { tenantId: SEED_TENANT_ID, email: from };
  return null;
}
