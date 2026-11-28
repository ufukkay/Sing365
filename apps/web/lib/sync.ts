import "server-only";
import { GraphClient, syncTenant, type SyncResult } from "@sing365/graph";
import { layoutFields } from "@sing365/render";
import { data, getDb } from "./data";
import { env } from "./env";

const CORE_DIRECTORY_FIELDS = [
  "job_title",
  "department",
  "company_name",
  "office_location",
  "business_phone",
  "mobile_phone",
];

/** Runs a directory sync for one tenant with the app's own credentials. */
export async function runSync(tenantId: string, entraTenantId: string, opts: { forceFull?: boolean } = {}): Promise<SyncResult | null> {
  const db = getDb();
  if (!db || !env.entraClientId || !env.entraClientSecret) return null;

  const [templates, rules] = await Promise.all([data.listTemplates(tenantId), data.listRules(tenantId)]);
  const fields = new Set<string>(CORE_DIRECTORY_FIELDS);
  const templateIds = new Set<string>();
  for (const template of templates) {
    if (template.status === "archived") continue;
    templateIds.add(template.id);
    for (const field of layoutFields(template.layout)) fields.add(field);
  }
  for (const rule of rules) {
    if (!rule.enabled || !templateIds.has(rule.templateId)) continue;
    for (const attr of rule.senders.attr ?? []) fields.add(attr.key.toLowerCase());
    for (const attr of rule.exceptions?.attr ?? []) fields.add(attr.key.toLowerCase());
  }

  const graph = new GraphClient(entraTenantId, { clientId: env.entraClientId, clientSecret: env.entraClientSecret });
  return syncTenant(db, graph, tenantId, { ...opts, fields });
}
