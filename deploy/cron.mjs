// Runs the directory sync on a schedule: calls the panel's /api/cron/sync every SYNC_EVERY_MINUTES (default 30).
const url = process.env.SYNC_URL ?? "http://web:3000/api/cron/sync";
const minutes = Number(process.env.SYNC_EVERY_MINUTES ?? 30);
const secret = process.env.CRON_SECRET ?? "";
if (!secret) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

async function tick() {
  const at = new Date().toISOString();
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10 * 60_000) });
    const body = await res.json().catch(() => ({}));
    const results = Array.isArray(body.results) ? body.results : [];
    console.log(JSON.stringify({ at, status: res.status, tenants: results.length, failed: results.filter((r) => !r.ok).length }));
  } catch (e) {
    console.log(JSON.stringify({ at, status: "error", error: String(e) }));
  }
}

// First run a minute after start, so the panel has time to come up.
setTimeout(() => {
  tick();
  setInterval(tick, minutes * 60_000);
}, 60_000);
