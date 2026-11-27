import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb, upsertTenantOnConsent, upsertUsers, type Db } from "@sing365/db";
import { postgresData } from "../lib/data/postgres";
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

  it("returns nothing for another tenant", async () => {
    const other = (await upsertTenantOnConsent(db, "44444444-4444-4444-8444-444444444444", "Diğer")).id;
    const data = postgresData(db);
    expect(await data.findUserByEmail(other, "ayse@data.com.tr")).toBeNull();
    expect(await data.listTemplates(other)).toEqual([]);
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
});
