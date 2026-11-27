import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { env } from "./env";

/** The signed-in admin. Stored in an http-only, signed cookie (HS256). */
export interface Session {
  tid: string; // Entra tenant id
  oid: string; // Entra object id of the person
  email: string;
  name: string;
  tenantId?: string; // Sing365 tenant id once the organisation has consented
}

const COOKIE = "s365_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

const key = () => {
  if (env.sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(env.sessionSecret);
};

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || env.sessionSecret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(raw, key(), { algorithms: ["HS256"] });
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export const sessionCookie = (value: string) => ({
  name: COOKIE,
  value,
  httpOnly: true,
  secure: env.publicUrl.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
});

export const clearedSessionCookie = () => ({ ...sessionCookie(""), maxAge: 0 });

/** Short-lived signed cookie carrying OAuth state, nonce and PKCE verifier across the redirect. */
export async function signFlow(payload: Record<string, string>): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(key());
}
export async function readFlow(raw: string | undefined): Promise<Record<string, string> | null> {
  if (!raw) return null;
  try {
    return (await jwtVerify(raw, key(), { algorithms: ["HS256"] })).payload as Record<string, string>;
  } catch {
    return null;
  }
}
export const FLOW_COOKIE = "s365_flow";
