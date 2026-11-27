import { NextResponse } from "next/server";
import { data } from "@/lib/data";
import { authenticateAddin } from "@/lib/addin-auth";
import { buildSignature } from "@/lib/signature";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/addin/signature?mode=new|reply&from=<address>&to=<a,b,c>
 * Called by the Outlook add-in on compose. Recipient addresses are only used to
 * decide internal vs external and are never stored.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "reply" ? "reply" : "new";
  const from = (url.searchParams.get("from") ?? "").trim().toLowerCase();
  const recipients = (url.searchParams.get("to") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL.test(s))
    .slice(0, 500);

  if (!EMAIL.test(from)) return NextResponse.json({ error: "invalid_from" }, { status: 400 });

  const caller = authenticateAddin(req, from);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await buildSignature(data, { tenantId: caller.tenantId, from, mode, recipients });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 404 });

  return NextResponse.json(
    { html: result.html, text: result.text, templateId: result.templateId, version: result.version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
