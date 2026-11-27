import { NextResponse } from "next/server";
import { getDb } from "@/lib/data";
import { env } from "@/lib/env";
import { runSync } from "@/lib/sync";

export const maxDuration = 300;

/** Scheduled delta sync for every consented tenant. Called by the host's cron with CRON_SECRET. */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "no_database" }, { status: 503 });
  const tenants = await db.sql<{ id: string; entra_tenant_id: string }[]>`
    select id, entra_tenant_id from tenants where consent_status = 'granted'`;
  const results = [];
  for (const t of tenants) {
    const r = await runSync(t.id, t.entra_tenant_id);
    results.push({ tenant: t.id, ok: r?.ok ?? false, usersChanged: r?.usersChanged ?? 0 });
  }
  return NextResponse.json({ results });
}
