import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb, upsertTenantOnConsent, upsertUsers, type Db } from "@sing365/db";
import { postgresData } from "../lib/data/postgres";
import { htmlLayout, htmlOf, htmlProblems } from "../lib/html-template";
import { buildSignature } from "../lib/signature";
import { addStarterTemplates } from "../lib/starter";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;

describe.runIf(ADMIN_URL && APP_URL)("Postgres data layer + signature", () => {
  let db: Db;
  let tenantId: string;

  beforeAll(async () => {
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    await admin`truncate tenants cascade`;
    await admin.end();
    db = createDb(APP_URL!);
    tenantId = (await upsertTenantOnConsent(db, "33333333-3333-4333-8333-333333333333", "Data A.Ş.")).id;
    await db.forTenant(tenantId, async (tx) => {
      await upsertUsers(tx, tenantId, [
        {
          entraObjectId: "00000000-0000-4000-8000-0000000000c1", email: "Ayse@Data.com.tr", aliases: ["satis@data.com.tr"],
          displayName: "Ayşe", givenName: null, surname: null, jobTitle: "Müdür", department: "Satış", companyName: "Data",
          officeLocation: null, businessPhone: "+90 1", mobilePhone: null, streetAddress: null, city: null, country: null,
          managerEntraId: null, extensionAttrs: {}, accountEnabled: true, mailboxType: "user",
        },
      ]);
      const [t] = await tx`insert into templates (tenant_id, kind, name, status, version, layout)
        values (${tenantId}, 'signature', 'Tam', 'published', 1,
        ${tx.json({ version: 1, fontStack: "Arial", colors: { text: "#222222", link: "#0b6e69" },
          elements: [{ type: "text", text: "{{display_name}} | {{job_title}}" }, { type: "text", text: "M {{mobile_phone}}" }] })})
        returning id`;
      await tx`insert into rules (tenant_id, template_id) values (${tenantId}, ${t!.id})`;
      await tx`update tenants set domains = '{data.com.tr}' where id = ${tenantId}`;
    });
  });
  afterAll(async () => db?.end());

  it("finds people by address or alias and renders their signature", async () => {
    const data = postgresData(db);
    const r = await buildSignature(data, { tenantId, from: "SATIS@data.com.tr", mode: "new", recipients: ["x@y.com"] });
    expect(r.ok && r.html).toContain("Ayşe | Müdür");
    expect(r.ok && r.html).not.toContain("M ");
  });

  it("searches, counts and lists people for pickers", async () => {
    const data = postgresData(db);
    expect((await data.listUsers(tenantId, { q: "ayş" })).map((u) => u.email)).toEqual(["ayse@data.com.tr"]);
    expect(await data.listUsers(tenantId, { q: "AYSE@DATA" })).toHaveLength(1);
    expect(await data.listUsers(tenantId, { q: "%" })).toEqual([]);
    expect(await data.listUsers(tenantId, { q: "nobody" })).toEqual([]);
    expect(await data.countUsers(tenantId)).toEqual({ total: 1, enabled: 1 });
    expect(await data.listPeople(tenantId)).toEqual([{ id: expect.any(String), email: "ayse@data.com.tr", displayName: "Ayşe" }]);
  });

  it("finds the tenant by its relay key, stores only a hash, and a new key replaces the old one", async () => {
    const data = postgresData(db);
    const first = await data.createRelayKey(tenantId);
    expect(first).toMatch(/^s365_[A-Za-z0-9_-]{43}$/);
    expect((await data.getTenantByRelayKey(first))?.id).toBe(tenantId);
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    const [row] = await admin<{ h: string }[]>`select relay_token_hash as h from tenants where id = ${tenantId}`;
    await admin.end();
    expect(row!.h).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.h).not.toContain(first);
    const second = await data.createRelayKey(tenantId);
    expect(await data.getTenantByRelayKey(first)).toBeNull();
    expect((await data.getTenantByRelayKey(second))?.id).toBe(tenantId);
    expect(await data.getTenantByRelayKey("")).toBeNull();
  });

  it("returns nothing for another tenant", async () => {
    const other = (await upsertTenantOnConsent(db, "44444444-4444-4444-8444-444444444444", "Diğer")).id;
    const data = postgresData(db);
    expect(await data.findUserByEmail(other, "ayse@data.com.tr")).toBeNull();
    expect(await data.listTemplates(other)).toEqual([]);
    expect(await data.countUsers(other)).toEqual({ total: 0, enabled: 0 });
    expect(await data.listPeople(other)).toEqual([]);
  });

  it("adds the starter signatures once; replies get the short one", async () => {
    const tid = (await upsertTenantOnConsent(db, "55555555-5555-4555-8555-555555555555", "Yeni A.Ş.")).id;
    await db.forTenant(tid, (tx) =>
      upsertUsers(tx, tid, [
        {
          entraObjectId: "00000000-0000-4000-8000-0000000000d1", email: "mehmet@yeni.com.tr", aliases: [],
          displayName: "Mehmet", givenName: null, surname: null, jobTitle: "Uzman", department: null, companyName: "Yeni",
          officeLocation: null, businessPhone: null, mobilePhone: null, streetAddress: null, city: null, country: null,
          managerEntraId: null, extensionAttrs: {}, accountEnabled: true, mailboxType: "user",
        },
      ]),
    );
    const data = postgresData(db);
    const fullId = await addStarterTemplates(data, tid);
    expect(await addStarterTemplates(data, tid)).toBe(fullId);
    expect((await data.listTemplates(tid)).map((t) => t.name).sort()).toEqual(["Kurumsal (tam)", "Yanıt (kısa)"]);
    expect(await data.listTemplates(tenantId)).toHaveLength(1);

    const fresh = await buildSignature(data, { tenantId: tid, from: "mehmet@yeni.com.tr", mode: "new", recipients: [] });
    expect(fresh.ok && fresh.templateId).toBe(fullId);
    const reply = await buildSignature(data, { tenantId: tid, from: "mehmet@yeni.com.tr", mode: "reply", recipients: [] });
    expect(reply.ok && reply.html).toContain("Mehmet | Uzman");
    expect(reply.ok && reply.templateId).not.toBe(fullId);
  });

  it("saves an HTML signature, fills it with the person's address and bumps the version on edit", async () => {
    const tid = (await upsertTenantOnConsent(db, "66666666-6666-4666-8666-666666666666", "Html A.Ş.")).id;
    await db.forTenant(tid, (tx) =>
      upsertUsers(tx, tid, [
        {
          entraObjectId: "00000000-0000-4000-8000-0000000000e1", email: "zeynep@html.com.tr", aliases: [],
          displayName: "Zeynep", givenName: "Zeynep", surname: "Işık", jobTitle: null, department: null, companyName: null,
          officeLocation: null, businessPhone: "+90 2", mobilePhone: null, streetAddress: "Kayalar Cd. 10", city: "Büyükçekmece",
          state: "İstanbul", postalCode: "34537", country: "Türkiye",
          managerEntraId: null, extensionAttrs: {}, accountEnabled: true, mailboxType: "user",
        },
      ]),
    );
    const data = postgresData(db);
    const html = `<p><b>{{given_name}} {{surname|upper}}</b>{{#job_title}} | {{job_title}}{{/job_title}}</p>
      <p>{{street_address}} {{postal_code}} {{city}} / {{state}}</p>
      <p>T: {{business_phone}}{{#mobile_phone}} | M: {{mobile_phone}}{{/mobile_phone}}</p>`;
    expect(htmlProblems("Talay", html)).toEqual([]);
    const id = await data.createTemplateWithRule(tid, {
      name: "Talay", kind: "signature", status: "published", layout: htmlLayout(html), priority: 50,
      rule: { senders: { all: true }, recipients: { scope: "any" }, appliesTo: "both" },
    });

    const r = await buildSignature(data, { tenantId: tid, from: "zeynep@html.com.tr", mode: "new", recipients: [] });
    expect(r.ok && r.templateId).toBe(id);
    expect(r.ok && r.html).toContain("Zeynep IŞIK");
    expect(r.ok && r.html).toContain("Kayalar Cd. 10 34537 Büyükçekmece / İstanbul");
    expect(r.ok && r.html).not.toContain("M:");
    expect(r.ok && r.html).not.toContain(" | ");

    await data.updateTemplate(tid, id, { name: "Talay 2", layout: htmlLayout("<p>{{email}}</p>") });
    const t = await data.getTemplate(tid, id);
    expect(t && { name: t.name, version: t.version, html: htmlOf(t) }).toEqual({ name: "Talay 2", version: 2, html: "<p>{{email}}</p>" });
    expect(await data.getTemplate(tenantId, id)).toBeNull();
  });
});
