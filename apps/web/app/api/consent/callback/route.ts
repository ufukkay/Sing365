import { after, NextResponse, type NextRequest } from "next/server";
import { upsertTenantOnConsent } from "@sing365/db";
import { GraphClient } from "@sing365/graph";
import { ensureAdmin } from "@/lib/admins";
import { getDb } from "@/lib/data";
import { env } from "@/lib/env";
import { FLOW_COOKIE, readFlow, readSession, sessionCookie, signSession } from "@/lib/session";
import { runSync } from "@/lib/sync";

const back = (reason: string) => NextResponse.redirect(`${env.publicUrl}/onboarding?error=${encodeURIComponent(reason)}`);

/** Entra redirects here after the admin consent screen: ?tenant=<tid>&admin_consent=True&state=... */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const flow = await readFlow(req.cookies.get(FLOW_COOKIE)?.value);
  const session = await readSession();
  if (!session) return NextResponse.redirect(`${env.publicUrl}/signin`);
  if (url.searchParams.get("error")) return back("consent_denied");
  if (!flow || flow.kind !== "consent" || flow.state !== url.searchParams.get("state")) return back("state");
  const tid = url.searchParams.get("tenant");
  // The consent must be for the signed-in admin's own tenant.
  if (url.searchParams.get("admin_consent")?.toLowerCase() !== "true" || !tid || tid !== flow.tid || tid !== session.tid) {
    return back("tenant_mismatch");
  }
  const db = getDb();
  if (!db) return back("no_database");

  // The query string is not proof of consent (anyone can type it): check that Sigwide can
  // really get an app token for this tenant before marking it as consented.
  if (!(await appCanSignIn(tid))) return back("consent_not_found");

  const tenant = await upsertTenantOnConsent(db, tid, session.email.split("@")[1] ?? "");
  // Only the tenant's first admin is created here; others must be added by an existing admin.
  const role = await ensureAdmin(db, tenant.id, session, { createIfFirst: true });
  if (!role) return back("not_admin");
  after(() => runSync(tenant.id, tid).then(() => undefined));

  const res = NextResponse.redirect(`${env.publicUrl}/`);
  res.cookies.set(sessionCookie(await signSession({ ...session, tenantId: tenant.id })));
  res.cookies.delete(FLOW_COOKIE);
  return res;
}

/** True once Entra issues Sigwide an app-only token for the tenant (consent can take a few seconds to apply). */
async function appCanSignIn(tid: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await new GraphClient(tid, { clientId: env.entraClientId, clientSecret: env.entraClientSecret }).accessToken();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}
