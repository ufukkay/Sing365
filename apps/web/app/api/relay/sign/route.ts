import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { data } from "@/lib/data";
import { env } from "@/lib/env";
import { buildSignature } from "@/lib/signature";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function relayAuthorized(req: Request): boolean {
  if (!env.relaySecret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env.relaySecret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * POST /api/relay/sign — called by the Sigwide mail relay for each message Exchange routes to it.
 * Body: { key, from, recipients, mode, skip }. The key (stamped by the customer's Exchange rule)
 * identifies the tenant. Answers with the signature for the sender (null if none or if the message
 * must not be changed) and the tenant domain whose Exchange Online endpoint the message goes back to.
 * Recipient addresses are only used to decide internal vs external and are never stored.
 */
export async function POST(req: Request) {
  if (!env.relaySecret) return NextResponse.json({ error: "relay_not_configured" }, { status: 503 });
  if (!relayAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    from?: unknown;
    recipients?: unknown;
    mode?: unknown;
    skip?: unknown;
  } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  const tenant = await data.getTenantByRelayKey(key);
  if (!tenant) return NextResponse.json({ error: "bad_key" }, { status: 403 });
  if (tenant.domains.length === 0) return NextResponse.json({ error: "no_domains" }, { status: 409 });

  const from = typeof body?.from === "string" ? body.from.trim().toLowerCase() : "";
  const fromDomain = from.split("@")[1] ?? "";
  // Mail always goes back to this tenant's own Exchange Online, never to a domain the tenant does not own.
  const returnDomain = tenant.domains.includes(fromDomain) ? fromDomain : tenant.domains[0]!;

  // A valid key with consent no longer granted (or a sync problem flagged it): the mail still goes
  // through, unsigned. Refusing it here would bounce the customer's mail.
  if (body?.skip || !EMAIL.test(from) || tenant.consentStatus !== "granted") return NextResponse.json({ signature: null, returnDomain });

  const recipients = (Array.isArray(body?.recipients) ? body.recipients : [])
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim().toLowerCase())
    .filter((r) => EMAIL.test(r))
    .slice(0, 500);
  const mode = body?.mode === "reply" ? "reply" : "new";
  const result = await buildSignature(data, { tenantId: tenant.id, from, mode, recipients });
  const signature = result.ok && result.templateId ? { html: result.html, text: result.text } : null;
  return NextResponse.json({ signature, returnDomain }, { headers: { "Cache-Control": "no-store" } });
}
