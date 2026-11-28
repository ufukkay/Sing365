import { beforeAll, describe, expect, it, vi } from "vitest";

// Seed (demo) data: tenant "Örnek Lojistik", domain example.com.
let POST: (req: Request) => Promise<Response>;
let key: string;

beforeAll(async () => {
  vi.stubEnv("RELAY_SECRET", "relay-secret");
  vi.stubEnv("DATABASE_URL", "");
  ({ POST } = await import("../app/api/relay/sign/route"));
  const { data, SEED_TENANT_ID } = await import("../lib/data");
  key = await data.createRelayKey(SEED_TENANT_ID);
});

const call = (body: unknown, secret = "relay-secret") =>
  POST(new Request("http://x/api/relay/sign", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) }));

describe("POST /api/relay/sign", () => {
  it("only answers the relay", async () => {
    expect((await call({ key }, "wrong")).status).toBe(401);
  });

  it("refuses an unknown key", async () => {
    expect((await call({ key: "sgw_nope", from: "ayse.yilmaz@example.com" })).status).toBe(403);
    expect((await call({ from: "ayse.yilmaz@example.com" })).status).toBe(403);
  });

  it("returns the sender's signature and the tenant domain to hand the message back to", async () => {
    const res = await call({ key, from: "Ayse.Yilmaz@example.com", recipients: ["musteri@baskafirma.com"], mode: "new" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.returnDomain).toBe("example.com");
    expect(body.signature.html).toContain("Ayşe Yılmaz");
    expect(body.signature.text).toContain("Ayşe Yılmaz");
  });

  it("never sends mail back to a domain the tenant does not own", async () => {
    const body = await (await call({ key, from: "someone@elsewhere.com", mode: "new" })).json();
    expect(body).toEqual({ signature: null, returnDomain: "example.com" });
  });

  it("gives no signature for messages that must not be changed", async () => {
    const body = await (await call({ key, from: "ayse.yilmaz@example.com", skip: true })).json();
    expect(body).toEqual({ signature: null, returnDomain: "example.com" });
  });

  it("lets mail through unsigned (instead of bouncing it) when the tenant's consent is no longer granted", async () => {
    const { data } = await import("../lib/data");
    const tenant = (await data.getTenantByRelayKey(key))!;
    tenant.consentStatus = "revoked";
    try {
      const res = await call({ key, from: "ayse.yilmaz@example.com", mode: "new" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ signature: null, returnDomain: "example.com" });
    } finally {
      tenant.consentStatus = "granted";
    }
  });
});
