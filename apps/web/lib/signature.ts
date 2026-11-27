import { render, type FieldValues } from "@sing365/render";
import { resolve, type Mode, type TraceEntry } from "@sing365/rules";
import type { DataLayer, DirectoryUser } from "./data/types";

/** Directory values for placeholders. Overrides (self-service, admin edits) win over synced values. */
export function fieldValues(u: DirectoryUser): FieldValues {
  const base: FieldValues = {
    display_name: u.displayName,
    given_name: u.givenName,
    surname: u.surname,
    job_title: u.jobTitle,
    department: u.department,
    company_name: u.companyName,
    office_location: u.officeLocation,
    email: u.email,
    business_phone: u.businessPhone,
    mobile_phone: u.mobilePhone,
    street_address: u.streetAddress,
    city: u.city,
    state: u.state,
    postal_code: u.postalCode,
    country: u.country,
    photo_url: u.photoUrl,
  };
  for (const [k, v] of Object.entries(u.extAttrs ?? {})) base[`ext.${k.toLowerCase()}`] = v;
  for (const [k, v] of Object.entries(u.customAttrs)) base[`custom.${k}`] = v;
  return { ...base, ...u.overrides };
}

export interface SignatureRequest {
  tenantId: string;
  /** The From address of the message being composed (primary or alias). */
  from: string;
  mode: Mode;
  recipients: string[];
  now?: Date;
}

export type SignatureResult =
  | { ok: false; reason: "unknown_sender" | "tenant_not_found"; trace: TraceEntry[] }
  | {
      ok: true;
      templateId: string | null;
      version: number | null;
      html: string;
      text: string;
      missing: string[];
      trace: TraceEntry[];
    };

export async function buildSignature(db: DataLayer, req: SignatureRequest): Promise<SignatureResult> {
  const tenant = await db.getTenant(req.tenantId);
  if (!tenant) return { ok: false, reason: "tenant_not_found", trace: [] };
  const user = await db.findUserByEmail(tenant.id, req.from);
  if (!user || !user.accountEnabled) return { ok: false, reason: "unknown_sender", trace: [] };

  const rules = await db.listRules(tenant.id);
  const templates = await db.listTemplates(tenant.id);
  const published = new Set(templates.filter((t) => t.status === "published").map((t) => t.id));
  const res = resolve(
    rules.filter((r) => published.has(r.templateId)),
    {
      sender: {
        id: user.id,
        email: user.email,
        department: user.overrides.department ?? user.department,
        groupIds: user.groupIds,
        attrs: Object.fromEntries(Object.entries(fieldValues(user)).map(([k, v]) => [k, v ?? ""])),
      },
      mode: req.mode,
      recipients: req.recipients,
      internalDomains: tenant.domains,
      now: req.now ?? new Date(),
    },
  );
  if (!res.templateId) return { ok: true, templateId: null, version: null, html: "", text: "", missing: [], trace: res.trace };
  const template = templates.find((t) => t.id === res.templateId)!;
  const out = render(template.layout, fieldValues(user));
  return { ok: true, templateId: template.id, version: template.version, html: out.html, text: out.text, missing: out.missing, trace: res.trace };
}
