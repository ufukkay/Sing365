import { describe, expect, it } from "vitest";
import { resolve, type Rule, type Sender } from "../src/index";

const now = new Date("2026-12-01T10:00:00Z");
const internalDomains = ["acme.com.tr"];

const ayse: Sender = {
  id: "u-ayse",
  email: "ayse@acme.com.tr",
  department: "Sales",
  groupIds: ["g-sales-eu"],
  attrs: { job_title: "Account Manager", office_location: "Istanbul" },
};
const mehmet: Sender = {
  id: "u-mehmet",
  email: "mehmet@acme.com.tr",
  department: "Engineering",
  groupIds: [],
  attrs: { job_title: "Engineer", office_location: "" },
};

function rule(p: Partial<Rule> & Pick<Rule, "id" | "templateId">): Rule {
  return {
    priority: 100,
    enabled: true,
    senders: { all: true },
    recipients: { scope: "any" },
    appliesTo: "both",
    ...p,
  };
}

const ctx = (sender: Sender, over: Partial<Parameters<typeof resolve>[1]> = {}) => ({
  sender,
  mode: "new" as const,
  recipients: ["client@example.com"],
  internalDomains,
  now,
  ...over,
});

describe("resolve", () => {
  it("returns null with a trace when nothing matches", () => {
    const r = resolve([rule({ id: "r1", templateId: "t1", senders: { departments: ["HR"] } })], ctx(ayse));
    expect(r.templateId).toBeNull();
    expect(r.trace).toEqual([expect.objectContaining({ ruleId: "r1", outcome: "sender_not_targeted" })]);
  });

  it("picks the lowest priority number first, ties by id", () => {
    const rules = [
      rule({ id: "b", templateId: "tb", priority: 10 }),
      rule({ id: "a", templateId: "ta", priority: 10 }),
      rule({ id: "c", templateId: "tc", priority: 1, enabled: false }),
    ];
    const r = resolve(rules, ctx(ayse));
    expect(r.templateId).toBe("ta");
    expect(r.trace.map((t) => t.outcome)).toEqual(["disabled", "matched"]);
  });

  it("targets by department case-insensitively and by group", () => {
    expect(resolve([rule({ id: "r", templateId: "t", senders: { departments: ["sales"] } })], ctx(ayse)).templateId).toBe("t");
    expect(resolve([rule({ id: "r", templateId: "t", senders: { groups: ["g-sales-eu"] } })], ctx(ayse)).templateId).toBe("t");
    expect(resolve([rule({ id: "r", templateId: "t", senders: { groups: ["g-sales-eu"] } })], ctx(mehmet)).templateId).toBeNull();
  });

  it("targets by attribute", () => {
    const r = rule({ id: "r", templateId: "t", senders: { attr: [{ key: "office_location", op: "is_empty" }] } });
    expect(resolve([r], ctx(mehmet)).templateId).toBe("t");
    expect(resolve([r], ctx(ayse)).templateId).toBeNull();
  });

  it("exceptions win over targeting", () => {
    const r = resolve([rule({ id: "r", templateId: "t", exceptions: { users: ["u-ayse"] } })], ctx(ayse));
    expect(r.templateId).toBeNull();
    expect(r.trace[0]?.outcome).toBe("sender_excepted");
  });

  it("separates new mail from replies", () => {
    const rules = [
      rule({ id: "1", templateId: "short", priority: 1, appliesTo: "reply" }),
      rule({ id: "2", templateId: "full", priority: 2, appliesTo: "new" }),
    ];
    expect(resolve(rules, ctx(ayse, { mode: "reply" })).templateId).toBe("short");
    expect(resolve(rules, ctx(ayse, { mode: "new" })).templateId).toBe("full");
  });

  it("internal rules need every recipient internal and at least one recipient", () => {
    const r = rule({ id: "r", templateId: "t", recipients: { scope: "internal" } });
    expect(resolve([r], ctx(ayse, { recipients: ["mehmet@ACME.com.tr"] })).templateId).toBe("t");
    expect(resolve([r], ctx(ayse, { recipients: ["mehmet@acme.com.tr", "x@example.com"] })).templateId).toBeNull();
    expect(resolve([r], ctx(ayse, { recipients: [] })).templateId).toBeNull();
  });

  it("external rules match with any external recipient, or before recipients are known", () => {
    const r = rule({ id: "r", templateId: "t", recipients: { scope: "external" } });
    expect(resolve([r], ctx(ayse, { recipients: ["mehmet@acme.com.tr", "x@example.com"] })).templateId).toBe("t");
    expect(resolve([r], ctx(ayse, { recipients: [] })).templateId).toBe("t");
    expect(resolve([r], ctx(ayse, { recipients: ["mehmet@acme.com.tr"] })).templateId).toBeNull();
  });

  it("recipient domain targeting", () => {
    const r = rule({ id: "r", templateId: "t", recipients: { scope: "any", domains: ["bigclient.com"] } });
    expect(resolve([r], ctx(ayse, { recipients: ["a@BigClient.com"] })).templateId).toBe("t");
    expect(resolve([r], ctx(ayse)).templateId).toBeNull();
  });

  it("respects active dates (until is exclusive)", () => {
    const r = rule({ id: "r", templateId: "t", activeFrom: "2026-12-01T00:00:00Z", activeUntil: "2026-12-01T10:00:00Z" });
    expect(resolve([r], ctx(ayse)).trace[0]?.outcome).toBe("not_active");
    const r2 = rule({ id: "r", templateId: "t", activeFrom: "2026-12-01T00:00:00Z", activeUntil: "2026-12-02T00:00:00Z" });
    expect(resolve([r2], ctx(ayse)).templateId).toBe("t");
  });
});
