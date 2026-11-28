import type { Layout } from "@sing365/render";
import type { Rule } from "@sing365/rules";
import { newRelayKey, relayKeyHash } from "../relay-key";
import type { DataLayer, DirectoryGroup, DirectoryUser, Template, Tenant } from "./types";

/**
 * Seed data for the vertical slice: one fictional tenant on example.com.
 * Replaced by the Postgres data layer in replica-backend.
 */

export const SEED_TENANT_ID = "00000000-0000-4000-8000-000000000001";

const tenant: Tenant = {
  id: SEED_TENANT_ID,
  entraTenantId: "11111111-1111-4111-8111-111111111111",
  name: "Örnek Lojistik A.Ş.",
  domains: ["example.com"],
  deploymentMode: "client",
  consentStatus: "granted",
  relayKeySet: false,
};

const groups: DirectoryGroup[] = [
  { id: "g-sales", displayName: "Satış" },
  { id: "g-all", displayName: "Tüm çalışanlar" },
];

const synced = "2026-11-27T09:00:00Z";

const users: DirectoryUser[] = [
  {
    id: "u-1",
    email: "ayse.yilmaz@example.com",
    aliases: ["satis@example.com"],
    displayName: "Ayşe Yılmaz",
    givenName: "Ayşe",
    surname: "Yılmaz",
    jobTitle: "Kurumsal Satış Müdürü",
    department: "Satış",
    companyName: "Örnek Lojistik A.Ş.",
    officeLocation: "İstanbul Merkez",
    businessPhone: "+90 212 555 01 10",
    mobilePhone: "+90 532 555 01 10",
    city: "İstanbul",
    country: "Türkiye",
    faxNumber: "+90 212 555 01 99",
    usageLocation: "TR",
    preferredLanguage: "tr-TR",
    groupIds: ["g-sales", "g-all"],
    customAttrs: {},
    overrides: {},
    accountEnabled: true,
    lastSyncedAt: synced,
  },
  {
    id: "u-2",
    email: "mehmet.demir@example.com",
    aliases: [],
    displayName: "Mehmet Demir",
    givenName: "Mehmet",
    surname: "Demir",
    jobTitle: "Yazılım Geliştirici",
    department: "Bilgi Teknolojileri",
    companyName: "Örnek Lojistik A.Ş.",
    officeLocation: "Ankara",
    businessPhone: "+90 312 555 02 20",
    mobilePhone: "",
    city: "Ankara",
    country: "Türkiye",
    groupIds: ["g-all"],
    customAttrs: {},
    overrides: {},
    accountEnabled: true,
    lastSyncedAt: synced,
  },
  {
    id: "u-3",
    email: "zeynep.kaya@example.com",
    aliases: [],
    displayName: "Zeynep Kaya",
    jobTitle: "",
    department: "İnsan Kaynakları",
    companyName: "Örnek Lojistik A.Ş.",
    businessPhone: "",
    mobilePhone: "",
    groupIds: ["g-all"],
    customAttrs: { pronouns: "o" },
    overrides: { job_title: "İK Uzmanı" },
    accountEnabled: true,
    lastSyncedAt: synced,
  },
];

const fontStack = "Arial, Helvetica, sans-serif";
const colors = { text: "#222222", muted: "#666666", link: "#0b6e69", divider: "#dddddd" };

const fullLayout: Layout = {
  version: 1,
  fontStack,
  colors,
  elements: [
    { type: "text", text: "{{display_name}}", style: { size: 16, bold: true } },
    { type: "text", text: "{{job_title}}", style: { color: "#666666" } },
    { type: "text", text: "{{company_name}} · {{department}}", style: { color: "#666666" } },
    { type: "divider" },
    { type: "text", text: "T {{business_phone}}", href: "tel:{{business_phone}}" },
    { type: "text", text: "M {{mobile_phone}}", href: "tel:{{mobile_phone}}" },
    { type: "text", text: "{{email}}", href: "mailto:{{email}}" },
    { type: "text", text: "{{office_location}}", style: { size: 12, color: "#666666" } },
  ],
};

const replyLayout: Layout = {
  version: 1,
  fontStack,
  colors,
  elements: [
    { type: "text", text: "{{display_name}} | {{job_title}}", style: { bold: true } },
    { type: "text", text: "{{company_name}}", style: { color: "#666666" } },
  ],
};

const salesLayout: Layout = {
  ...fullLayout,
  elements: [
    ...fullLayout.elements,
    { type: "spacer", height: 8 },
    {
      type: "text",
      text: "Yeni depo hizmetimizle tanışın",
      href: "https://example.com/depo",
      style: { bold: true, color: "#0b6e69" },
    },
  ],
};

const initialTemplates: Template[] = [
  { id: "t-full", name: "Kurumsal (tam)", kind: "signature", status: "published", version: 3, layout: fullLayout, updatedAt: "2026-11-26T15:20:00Z" },
  { id: "t-reply", name: "Yanıt (kısa)", kind: "signature", status: "published", version: 1, layout: replyLayout, updatedAt: "2026-11-25T11:00:00Z" },
  { id: "t-sales", name: "Satış ekibi, dış alıcılar", kind: "signature", status: "published", version: 2, layout: salesLayout, updatedAt: "2026-11-26T16:45:00Z" },
  { id: "t-draft", name: "Yılbaşı kampanyası", kind: "signature", status: "draft", version: 0, layout: fullLayout, updatedAt: "2026-11-27T08:10:00Z" },
];

const initialRules: Rule[] = [
  { id: "r-reply", templateId: "t-reply", priority: 10, enabled: true, appliesTo: "reply", senders: { all: true }, recipients: { scope: "any" } },
  { id: "r-sales", templateId: "t-sales", priority: 20, enabled: true, appliesTo: "new", senders: { groups: ["g-sales"] }, recipients: { scope: "external" } },
  { id: "r-all", templateId: "t-full", priority: 100, enabled: true, appliesTo: "both", senders: { all: true }, recipients: { scope: "any" } },
];

// Route bundles in a single demo process share the same drafts and application rules.
const demo = globalThis as typeof globalThis & { sigwideDemoSignatures?: { templates: Template[]; rules: Rule[] } };
const { templates, rules } = (demo.sigwideDemoSignatures ??= { templates: initialTemplates, rules: initialRules });

const relayHashes = new Map<string, string>();

const byTenant = <T,>(tenantId: string, rows: T[]): T[] => (tenantId === SEED_TENANT_ID ? rows : []);

export const seedData: DataLayer = {
  async getTenant(id) {
    return id === tenant.id ? { ...tenant, relayKeySet: relayHashes.has(tenant.id) } : null;
  },
  async getTenantByEntraId(tid) {
    return tid === tenant.entraTenantId ? tenant : null;
  },
  async getTenantByRelayKey(key) {
    return key && relayHashes.get(tenant.id) === relayKeyHash(key) ? tenant : null;
  },
  async createRelayKey(tenantId) {
    const key = newRelayKey();
    relayHashes.set(tenantId, relayKeyHash(key));
    return key;
  },
  async listUsers(tenantId, opts = {}) {
    const q = opts.q?.trim().toLocaleLowerCase("tr-TR");
    const rows = byTenant(tenantId, users).filter(
      (u) => u.accountEnabled && (!q || u.displayName.toLocaleLowerCase("tr-TR").includes(q) || u.email.includes(q)),
    );
    return rows.slice(0, opts.limit ?? 500);
  },
  async countUsers(tenantId) {
    const rows = byTenant(tenantId, users);
    return { total: rows.length, enabled: rows.filter((u) => u.accountEnabled).length };
  },
  async listPeople(tenantId) {
    return byTenant(tenantId, users)
      .filter((u) => u.accountEnabled)
      .map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }));
  },
  async getUser(tenantId, userId) {
    return byTenant(tenantId, users).find((u) => u.id === userId) ?? null;
  },
  async findUserByEmail(tenantId, email) {
    const e = email.trim().toLowerCase();
    return byTenant(tenantId, users).find((u) => u.email === e || u.aliases.includes(e)) ?? null;
  },
  async listGroups(tenantId) {
    return byTenant(tenantId, groups);
  },
  async listTemplates(tenantId) {
    return byTenant(tenantId, templates);
  },
  async getTemplate(tenantId, id) {
    return byTenant(tenantId, templates).find((t) => t.id === id) ?? null;
  },
  async listRules(tenantId) {
    return byTenant(tenantId, rules);
  },
  async getSyncStatus(tenantId) {
    return tenantId === SEED_TENANT_ID
      ? { state: "succeeded", finishedAt: synced, usersChanged: users.length }
      : { state: "never", finishedAt: null, usersChanged: 0 };
  },
  async createTemplateWithRule(tenantId, input) {
    if (tenantId !== SEED_TENANT_ID) throw new Error("unknown tenant");
    // Demo mode keeps it in memory until the dev server restarts.
    const id = `t-${templates.length + 1}-${Date.now()}`;
    templates.push({ id, name: input.name, kind: input.kind, status: input.status, version: 1, layout: input.layout, updatedAt: new Date().toISOString() });
    rules.push({ id: `r-${id}`, templateId: id, priority: input.priority, enabled: input.rule.enabled ?? true, ...input.rule });
    return id;
  },
  async updateTemplate(tenantId, templateId, input) {
    const t = byTenant(tenantId, templates).find((x) => x.id === templateId);
    if (!t) throw new Error("template not found");
    Object.assign(t, { name: input.name, layout: input.layout, version: t.version + 1, updatedAt: new Date().toISOString() });
  },
  async updateVisualTemplate(tenantId, templateId, input) {
    const template = byTenant(tenantId, templates).find((entry) => entry.id === templateId);
    if (!template || template.kind !== "signature" || template.version !== input.version || template.status === "archived") return false;
    Object.assign(template, { name: input.name, layout: input.layout, version: template.version + 1, updatedAt: new Date().toISOString() });
    return true;
  },
  async updateTemplateApplication(tenantId, templateId, input) {
    const template = byTenant(tenantId, templates).find((entry) => entry.id === templateId);
    if (!template || template.kind !== "signature" || template.version !== input.version || template.status === "archived") return false;
    const { ruleId, priority, senders, recipients, appliesTo, enabled } = input;
    const templateRules = byTenant(tenantId, rules).filter((entry) => entry.templateId === templateId);
    if (ruleId) {
      const rule = templateRules.find((entry) => entry.id === ruleId);
      if (!rule) return false;
      Object.assign(rule, { priority, senders, recipients, appliesTo, enabled });
    } else {
      if (templateRules.length) return false;
      rules.push({ id: `r-${templateId}`, templateId, priority, senders, recipients, appliesTo, enabled });
    }
    Object.assign(template, { version: template.version + 1, updatedAt: new Date().toISOString() });
    return true;
  },
  async setVisualTemplateStatus(tenantId, templateId, version, status, previous) {
    const template = byTenant(tenantId, templates).find((entry) => entry.id === templateId);
    if (!template || template.kind !== "signature" || template.version !== version || template.status !== previous) return false;
    Object.assign(template, { status, version: template.version + 1, updatedAt: new Date().toISOString() });
    return true;
  },
  async deleteArchivedTemplate(tenantId, templateId, version) {
    const template = byTenant(tenantId, templates).find((entry) => entry.id === templateId);
    if (!template || template.kind !== "signature" || template.status !== "archived" || template.version !== version) return false;
    templates.splice(templates.indexOf(template), 1);
    for (let index = rules.length - 1; index >= 0; index--) {
      if (rules[index]?.templateId === templateId) rules.splice(index, 1);
    }
    return true;
  },
};
