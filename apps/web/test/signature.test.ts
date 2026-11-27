import { describe, expect, it } from "vitest";
import { seedData, SEED_TENANT_ID } from "../lib/data/seed";
import { buildSignature } from "../lib/signature";

const base = { tenantId: SEED_TENANT_ID, now: new Date("2026-12-01T10:00:00Z") };

describe("buildSignature on seed data", () => {
  it("gives sales a campaign signature for external new mail", async () => {
    const r = await buildSignature(seedData, { ...base, from: "ayse.yilmaz@example.com", mode: "new", recipients: ["client@other.com"] });
    expect(r.ok && r.templateId).toBe("t-sales");
    expect(r.ok && r.html).toContain("Ayşe Yılmaz");
  });

  it("gives the full signature for internal new mail and the short one for replies", async () => {
    const internal = await buildSignature(seedData, { ...base, from: "ayse.yilmaz@example.com", mode: "new", recipients: ["mehmet.demir@example.com"] });
    expect(internal.ok && internal.templateId).toBe("t-full");
    const reply = await buildSignature(seedData, { ...base, from: "ayse.yilmaz@example.com", mode: "reply", recipients: [] });
    expect(reply.ok && reply.templateId).toBe("t-reply");
  });

  it("resolves aliases to the person", async () => {
    const r = await buildSignature(seedData, { ...base, from: "SATIS@example.com", mode: "new", recipients: [] });
    expect(r.ok && r.html).toContain("Ayşe Yılmaz");
  });

  it("hides the mobile line for someone without a mobile number", async () => {
    const r = await buildSignature(seedData, { ...base, from: "mehmet.demir@example.com", mode: "new", recipients: [] });
    expect(r.ok && r.html).not.toContain(">M ");
    expect(r.ok && r.missing).toContain("mobile_phone");
  });

  it("lets overrides win over synced values", async () => {
    const r = await buildSignature(seedData, { ...base, from: "zeynep.kaya@example.com", mode: "new", recipients: [] });
    expect(r.ok && r.html).toContain("İK Uzmanı");
  });

  it("refuses unknown senders and other tenants", async () => {
    expect((await buildSignature(seedData, { ...base, from: "nobody@example.com", mode: "new", recipients: [] })).ok).toBe(false);
    expect((await buildSignature(seedData, { ...base, tenantId: "other", from: "ayse.yilmaz@example.com", mode: "new", recipients: [] })).ok).toBe(false);
  });
});
