import { SEED_TENANT_ID } from "./data";

export interface AddinCaller {
  tenantId: string;
  /** The signed-in mailbox owner. A send-as/shared mailbox From must be checked against it in replica-backend. */
  email: string;
}

/**
 * Who is calling the add-in API.
 *
 * Production: validate the Entra access token from Nested App Authentication
 * (signature, issuer, aud = Sing365 API, tid = consented tenant). That lands in
 * replica-backend. Until then this only works with SING365_DEV_AUTH=1, which
 * trusts the `from` parameter against the seed tenant, and it refuses
 * everything else so a deploy cannot accidentally run unauthenticated.
 */
export function authenticateAddin(req: Request, from: string): AddinCaller | null {
  if (process.env.SING365_DEV_AUTH === "1" && process.env.NODE_ENV !== "production") {
    return { tenantId: SEED_TENANT_ID, email: from };
  }
  void req;
  return null;
}
