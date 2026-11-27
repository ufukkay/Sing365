import { NextResponse } from "next/server";
import { adminConsentUrl, randomToken } from "@/lib/entra";
import { entraConfigured, env } from "@/lib/env";
import { FLOW_COOKIE, readSession, signFlow } from "@/lib/session";

/** Sends a signed-in Microsoft 365 admin to the tenant-wide consent screen. */
export async function POST() {
  if (!entraConfigured()) return NextResponse.json({ error: "entra_not_configured" }, { status: 503 });
  const session = await readSession();
  if (!session) return NextResponse.redirect(`${env.publicUrl}/signin`, 303);
  const state = randomToken();
  const res = NextResponse.redirect(
    adminConsentUrl({ clientId: env.entraClientId, tid: session.tid, redirectUri: `${env.publicUrl}/api/consent/callback`, state }),
    303,
  );
  res.cookies.set({
    name: FLOW_COOKIE,
    value: await signFlow({ kind: "consent", state, tid: session.tid }),
    httpOnly: true,
    secure: env.publicUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
