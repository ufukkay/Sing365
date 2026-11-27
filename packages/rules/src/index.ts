/**
 * Sing365 rule engine.
 *
 * One pure function decides which template a sender gets. The add-in API, the
 * rules tester and the server-side relay all call it, so they never disagree.
 * The shapes match the `rules` table's JSONB columns in replica/schema.sql.
 */

export type Mode = "new" | "reply";

export interface AttrCondition {
  key: string;
  op: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string;
}

/** Who a rule targets (senders) or excludes (exceptions). Any listed item matches. */
export interface SenderCondition {
  all?: boolean;
  users?: string[];
  groups?: string[];
  departments?: string[];
  attr?: AttrCondition[];
}

export interface RecipientCondition {
  /**
   * any: always matches.
   * internal: every recipient is on an internal domain (and there is at least one).
   * external: at least one recipient is external, or recipients are not known yet.
   */
  scope: "any" | "internal" | "external";
  /** Optional: at least one recipient must be on one of these domains. */
  domains?: string[];
}

export interface Rule {
  id: string;
  templateId: string;
  /** Lower runs first. Ties break on id so results are stable. */
  priority: number;
  enabled: boolean;
  senders: SenderCondition;
  recipients: RecipientCondition;
  exceptions?: SenderCondition;
  appliesTo: "new" | "reply" | "both";
  activeFrom?: Date | string | null;
  activeUntil?: Date | string | null;
}

export interface Sender {
  id: string;
  email: string;
  department?: string | null;
  groupIds: string[];
  /** Flat attribute map: job_title, office_location, custom.* and so on. */
  attrs: Record<string, string | null | undefined>;
}

export interface ResolveContext {
  sender: Sender;
  mode: Mode;
  /** Recipient email addresses. Empty while the user has not typed any yet. */
  recipients: string[];
  /** The tenant's own domains, lower case. */
  internalDomains: string[];
  now: Date;
}

export type TraceOutcome =
  | "matched"
  | "disabled"
  | "not_active"
  | "wrong_mode"
  | "sender_not_targeted"
  | "sender_excepted"
  | "recipients_not_matched";

export interface TraceEntry {
  ruleId: string;
  templateId: string;
  outcome: TraceOutcome;
  detail: string;
}

export interface Resolution {
  templateId: string | null;
  ruleId: string | null;
  trace: TraceEntry[];
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function attrMatches(c: AttrCondition, sender: Sender): boolean {
  const raw = sender.attrs[c.key];
  const v = norm(raw);
  const want = norm(c.value);
  switch (c.op) {
    case "equals":
      return v === want;
    case "not_equals":
      return v !== want;
    case "contains":
      return want !== "" && v.includes(want);
    case "is_empty":
      return v === "";
    case "is_not_empty":
      return v !== "";
  }
}

/** Returns a human-readable reason when the sender matches, or null. */
export function senderMatches(cond: SenderCondition | undefined, sender: Sender): string | null {
  if (!cond) return null;
  if (cond.all) return "herkes";
  if (cond.users?.includes(sender.id)) return "listedeki kişi";
  const group = cond.groups?.find((g) => sender.groupIds.includes(g));
  if (group) return `${group} grubunun üyesi`;
  const dept = norm(sender.department);
  if (dept && cond.departments?.some((d) => norm(d) === dept)) return `${sender.department} departmanı`;
  const attr = cond.attr?.find((a) => attrMatches(a, sender));
  if (attr) return `${attr.key} özelliği ${attr.op}${attr.value ? ` ${attr.value}` : ""}`;
  return null;
}

export function recipientsMatch(
  cond: RecipientCondition,
  recipients: string[],
  internalDomains: string[],
): { ok: boolean; detail: string } {
  const internal = new Set(internalDomains.map(norm));
  const domains = recipients.map(domainOf).filter(Boolean);
  const externalCount = domains.filter((d) => !internal.has(d)).length;

  let scopeOk: boolean;
  let detail: string;
  switch (cond.scope) {
    case "any":
      scopeOk = true;
      detail = "tüm alıcılar";
      break;
    case "internal":
      scopeOk = domains.length > 0 && externalCount === 0;
      detail = domains.length === 0 ? "henüz alıcı yok, iç kurallar bekler" : `${externalCount} dış alıcı`;
      break;
    case "external":
      scopeOk = domains.length === 0 || externalCount > 0;
      detail = domains.length === 0 ? "henüz alıcı yok, dış kabul edilir" : `${externalCount} dış alıcı`;
      break;
  }
  if (!scopeOk) return { ok: false, detail };

  if (cond.domains && cond.domains.length > 0) {
    const wanted = new Set(cond.domains.map(norm));
    const hit = domains.find((d) => wanted.has(d));
    if (!hit) return { ok: false, detail: `${[...wanted].join(", ")} alan adında alıcı yok` };
    return { ok: true, detail: `${hit} alan adında alıcı var` };
  }
  return { ok: true, detail };
}

export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/** First matching rule wins. The trace explains every rule that was looked at. */
export function resolve(rules: Rule[], ctx: ResolveContext): Resolution {
  const trace: TraceEntry[] = [];
  for (const rule of sortRules(rules)) {
    const base = { ruleId: rule.id, templateId: rule.templateId };
    if (!rule.enabled) {
      trace.push({ ...base, outcome: "disabled", detail: "kural kapalı" });
      continue;
    }
    const from = toDate(rule.activeFrom);
    const until = toDate(rule.activeUntil);
    if ((from && ctx.now < from) || (until && ctx.now >= until)) {
      trace.push({ ...base, outcome: "not_active", detail: "kuralın geçerlilik tarihleri dışında" });
      continue;
    }
    if (rule.appliesTo !== "both" && rule.appliesTo !== ctx.mode) {
      trace.push({ ...base, outcome: "wrong_mode", detail: `kural yalnızca ${rule.appliesTo === "reply" ? "yanıt/iletme" : "yeni"} mesajlar için` });
      continue;
    }
    const why = senderMatches(rule.senders, ctx.sender);
    if (!why) {
      trace.push({ ...base, outcome: "sender_not_targeted", detail: "gönderen bu kuralda yok" });
      continue;
    }
    const except = senderMatches(rule.exceptions, ctx.sender);
    if (except) {
      trace.push({ ...base, outcome: "sender_excepted", detail: `hariç tutuldu: ${except}` });
      continue;
    }
    const rec = recipientsMatch(rule.recipients, ctx.recipients, ctx.internalDomains);
    if (!rec.ok) {
      trace.push({ ...base, outcome: "recipients_not_matched", detail: rec.detail });
      continue;
    }
    trace.push({ ...base, outcome: "matched", detail: `${why}; ${rec.detail}` });
    return { templateId: rule.templateId, ruleId: rule.id, trace };
  }
  return { templateId: null, ruleId: null, trace };
}
