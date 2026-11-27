import { NextResponse } from "next/server";
import { data } from "@/lib/data";
import { env } from "@/lib/env";
import { readSession } from "@/lib/session";
import { runSync } from "@/lib/sync";

/** "Sync now" from the panel. */
export async function POST() {
  const session = await readSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await data.getTenant(session.tenantId);
  if (!tenant || tenant.consentStatus !== "granted") return NextResponse.json({ error: "no_consent" }, { status: 409 });
  await runSync(tenant.id, tenant.entraTenantId);
  return NextResponse.redirect(`${env.publicUrl}/`, 303);
}
