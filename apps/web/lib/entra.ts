import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { authority } from "./env";

/**
 * Entra ID (Microsoft identity platform v2) helpers for a multi-tenant app.
 * Tokens from any tenant are signed with the common keys; the issuer must
 * match the token's own tenant (tid), which is how multi-tenant issuer checks work.
 */

const JWKS = createRemoteJWKSet(new URL(`${authority}/common/discovery/v2.0/keys`));

export interface EntraClaims extends JWTPayload {
  tid: string;
  oid: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  nonce?: string;
  scp?: string;
  ver?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyEntraToken(
  token: string,
  opts: { audience: string | string[]; nonce?: string; keys?: Parameters<typeof jwtVerify>[1] },
): Promise<EntraClaims> {
  const { payload } = await jwtVerify(token, (opts.keys ?? JWKS) as Parameters<typeof jwtVerify>[1], {
    audience: opts.audience,
    algorithms: ["RS256"],
    clockTolerance: 60,
  });
  const claims = payload as EntraClaims;
  if (!claims.tid || !GUID.test(claims.tid)) throw new Error("token has no tenant id");
  if (!claims.oid) throw new Error("token has no object id");
  const v1 = `https://sts.windows.net/${claims.tid}/`;
  const v2 = `${authority}/${claims.tid}/v2.0`;
  if (claims.iss !== v2 && claims.iss !== v1) throw new Error("issuer does not match the token's tenant");
  if (opts.nonce !== undefined && claims.nonce !== opts.nonce) throw new Error("nonce mismatch");
  return claims;
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string }): string {
  const u = new URL(`${authority}/organizations/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: p.redirectUri,
    response_mode: "query",
    scope: "openid profile email offline_access User.Read",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export function adminConsentUrl(p: { clientId: string; tid: string; redirectUri: string; state: string }): string {
  const u = new URL(`${authority}/${encodeURIComponent(p.tid)}/v2.0/adminconsent`);
  u.search = new URLSearchParams({
    client_id: p.clientId,
    scope: "https://graph.microsoft.com/.default",
    redirect_uri: p.redirectUri,
    state: p.state,
  }).toString();
  return u.toString();
}

export async function exchangeCode(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ id_token: string }> {
  const res = await fetch(`${authority}/organizations/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: p.clientId,
      client_secret: p.clientSecret,
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.codeVerifier,
    }),
  });
  const body = (await res.json()) as { id_token?: string; error_description?: string };
  if (!res.ok || !body.id_token) throw new Error(body.error_description ?? `token endpoint returned ${res.status}`);
  return { id_token: body.id_token };
}

export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(a).toString("base64url");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(d).toString("base64url");
}
