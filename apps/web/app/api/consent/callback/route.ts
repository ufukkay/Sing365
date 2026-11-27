import { after, NextResponse, type NextRequest } from "next/server";
import { upsertTenantOnConsent } from "@sing365/db";
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

  const tenant = await upsertTenantOnConsent(db, tid, session.email.split("@")[1] ?? "");
  await ensureAdmin(db, tenant.id, session, { createIfFirst: true });
  after(() => runSync(tenant.id, tid).then(() => undefined));

  const res = NextResponse.redirect(`${env.publicUrl}/`);
  res.cookies.set(sessionCookie(await signSession({ ...session, tenantId: tenant.id })));
  res.cookies.delete(FLOW_COOKIE);
  return res;
}
