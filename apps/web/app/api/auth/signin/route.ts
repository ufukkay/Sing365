import { NextResponse } from "next/server";
import { authorizeUrl, pkceChallenge, randomToken } from "@/lib/entra";
import { entraConfigured, env } from "@/lib/env";
import { FLOW_COOKIE, signFlow } from "@/lib/session";

export async function GET() {
  if (!entraConfigured()) return NextResponse.json({ error: "entra_not_configured" }, { status: 503 });
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const res = NextResponse.redirect(
    authorizeUrl({
      clientId: env.entraClientId,
      redirectUri: `${env.publicUrl}/api/auth/callback/microsoft-entra-id`,
      state,
      nonce,
      codeChallenge: await pkceChallenge(verifier),
    }),
  );
  res.cookies.set({
    name: FLOW_COOKIE,
    value: await signFlow({ kind: "signin", state, nonce, verifier }),
    httpOnly: true,
    secure: env.publicUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
