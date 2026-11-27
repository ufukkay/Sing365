import { NextResponse, type NextRequest } from "next/server";
import { ensureAdmin } from "@/lib/admins";
import { data, getDb } from "@/lib/data";
import { exchangeCode, verifyEntraToken } from "@/lib/entra";
import { env } from "@/lib/env";
import { FLOW_COOKIE, readFlow, sessionCookie, signSession } from "@/lib/session";

const fail = (reason: string) => NextResponse.redirect(`${env.publicUrl}/signin?error=${encodeURIComponent(reason)}`);

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const flow = await readFlow(req.cookies.get(FLOW_COOKIE)?.value);
  if (url.searchParams.get("error")) return fail("denied");
  if (!flow || flow.kind !== "signin" || flow.state !== url.searchParams.get("state")) return fail("state");
  const code = url.searchParams.get("code");
  if (!code) return fail("code");

  let claims;
  try {
    const { id_token } = await exchangeCode({
      clientId: env.entraClientId,
      clientSecret: env.entraClientSecret,
      code,
      redirectUri: `${env.publicUrl}/api/auth/callback/microsoft-entra-id`,
      codeVerifier: flow.verifier!,
    });
    claims = await verifyEntraToken(id_token, { audience: env.entraClientId, nonce: flow.nonce });
  } catch {
    return fail("token");
  }

  const person = {
    oid: claims.oid,
    email: (claims.email ?? claims.preferred_username ?? "").toLowerCase(),
    name: claims.name ?? claims.preferred_username ?? "",
  };
  const tenant = await data.getTenantByEntraId(claims.tid);
  let tenantId: string | undefined;
  const db = getDb();
  if (tenant && tenant.consentStatus === "granted" && db) {
    const role = await ensureAdmin(db, tenant.id, person, { createIfFirst: false });
    if (!role) return fail("not_admin");
    tenantId = tenant.id;
  }

  const res = NextResponse.redirect(`${env.publicUrl}${tenantId ? "/" : "/onboarding"}`);
  res.cookies.set(sessionCookie(await signSession({ tid: claims.tid, ...person, tenantId })));
  res.cookies.delete(FLOW_COOKIE);
  return res;
}
