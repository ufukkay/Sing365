"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { render, type FieldValues, type Layout } from "@sing365/render";
import type { Mode, Rule } from "@sing365/rules";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { htmlLayout, htmlProblems } from "@/lib/html-template";
import { addStarterTemplates } from "@/lib/starter";
import { hasSignatureContent, parseVisualLayout, simpleVisualRule } from "@/lib/visual-signature";

/** Creates the starter signatures and opens the full one, previewed for the signed-in admin. */
export async function addStarterTemplatesAction() {
  const { tenantId, session } = await requirePanel();
  const id = await addStarterTemplates(data, tenantId);
  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  revalidatePath("/signatures");
  revalidatePath("/");
  redirect(`/signatures/${id}${me ? `?user=${encodeURIComponent(me.id)}` : ""}`);
}

export interface HtmlFormState {
  errors: string[];
  /** What was sent, so the form shows it again after an error (React clears a form after its action). */
  values?: { name: string; html: string; appliesTo: string; priority: string };
}

const APPLIES: (Mode | "both")[] = ["both", "new", "reply"];
const RECIPIENTS: Rule["recipients"]["scope"][] = ["any", "internal", "external"];

export interface VisualFormState {
  errors: string[];
}

function refreshSignatures(id: string) {
  revalidatePath("/signatures");
  revalidatePath("/signatures/apply");
  revalidatePath(`/signatures/${id}`);
  revalidatePath(`/signatures/${id}/edit`);
  revalidatePath("/");
}

function applicationUrl(id: string, notice: string) {
  const query = new URLSearchParams({ notice });
  if (id) query.set("template", id);
  return `/signatures/apply?${query}`;
}

function submittedVersion(form: FormData) {
  const raw = form.get("version");
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const version = Number(raw);
  return Number.isSafeInteger(version) ? version : null;
}

function submittedLayout(form: FormData) {
  const raw = form.get("layout");
  if (typeof raw !== "string" || raw.length > 90_000) return parseVisualLayout(null);
  try {
    return parseVisualLayout(JSON.parse(raw));
  } catch {
    return parseVisualLayout(null);
  }
}

export async function previewVisualTemplateAction(layout: Layout, values: FieldValues) {
  await requirePanel();
  const parsed = parseVisualLayout(layout);
  if (!parsed.layout) return { html: "", text: "", missing: [] };
  const previewValues: FieldValues = {};
  for (const [key, value] of Object.entries(values ?? {}).slice(0, 100)) {
    if (/^[a-z][a-z0-9_.]{0,99}$/.test(key) && typeof value === "string") previewValues[key] = value.slice(0, 500);
  }
  const { html, text, missing } = render(parsed.layout, previewValues);
  return { html, text, missing };
}

function normalizeSignatureName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

async function duplicateNameError(tenantId: string, name: string, excludeId?: string): Promise<string | null> {
  const target = normalizeSignatureName(name);
  const templates = await data.listTemplates(tenantId);
  const match = templates.find((t) => t.kind === "signature" && t.id !== excludeId && normalizeSignatureName(t.name) === target);
  if (!match) return null;
  return match.status === "archived"
    ? `“${name}” adında arşivlenmiş bir imza zaten var. Farklı bir ad girin veya arşivden geri alın.`
    : `“${name}” adında bir imza zaten var. Farklı bir ad girin.`;
}

async function uniqueCopyName(tenantId: string, baseName: string): Promise<string> {
  const templates = await data.listTemplates(tenantId);
  const used = new Set(templates.filter((t) => t.kind === "signature").map((t) => normalizeSignatureName(t.name)));
  const cleanBase = baseName.replace(/\s*·\s*Kopya(?:\s+\d+)?$/i, "").slice(0, 84).trim();
  for (let n = 1; n <= 999; n++) {
    const candidate = n === 1 ? `${cleanBase} · Kopya` : `${cleanBase} · Kopya ${n}`;
    if (!used.has(normalizeSignatureName(candidate))) return candidate;
  }
  return `${cleanBase.slice(0, 76)} · ${Date.now()}`;
}

export async function saveVisualTemplateAction(_prev: VisualFormState, form: FormData): Promise<VisualFormState> {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const parsed = submittedLayout(form);
  if (!parsed.layout) return { errors: parsed.errors };
  if (!name || name.length > 100) return { errors: ["İmza adı 1–100 karakter arasında olmalı."] };
  const duplicate = await duplicateNameError(tenantId, name, id || undefined);
  if (duplicate) return { errors: [duplicate] };
  if (id) {
    const existing = await data.getTemplate(tenantId, id);
    if (existing?.kind !== "signature" || existing.status === "archived" || !parseVisualLayout(existing.layout).layout) {
      return { errors: ["Görsel imza bulunamadı veya artık düzenlenemiyor."] };
    }
    if (existing.status === "published" && !hasSignatureContent(parsed.layout)) return { errors: ["Yayındaki imzada en az bir içerik bloğu olmalı."] };
    const version = submittedVersion(form);
    if (version === null) return { errors: ["İmzayı yeniden açıp değişikliklerinizi kaydedin."] };
    const updated = await data.updateVisualTemplate(tenantId, id, { name, layout: parsed.layout, version });
    if (!updated) return { errors: ["Bu şablon başka bir oturumda değiştirildi. İmzayı yeniden açıp tekrar deneyin."] };
    refreshSignatures(id);
    redirect(`/signatures/${id}`);
  }

  const savedId = await data.createTemplateWithRule(tenantId, {
    name, kind: "signature", status: "draft", layout: parsed.layout, priority: 50,
    rule: { senders: { all: true }, recipients: { scope: "any" }, appliesTo: "both" },
  });
  refreshSignatures(savedId);
  redirect(applicationUrl(savedId, "draft"));
}

export async function configureTemplateApplicationAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const [template, rules] = await Promise.all([data.getTemplate(tenantId, id), data.listRules(tenantId)]);
  if (template?.kind !== "signature" || template.status === "archived") redirect(applicationUrl("", "invalid"));

  const version = submittedVersion(form);
  const templateRules = rules.filter((entry) => entry.templateId === id);
  const rule = simpleVisualRule(templateRules);
  if (templateRules.length && !rule) redirect(applicationUrl(id, "advanced"));

  const appliesTo = APPLIES.find((option) => option === form.get("appliesTo"));
  const scope = RECIPIENTS.find((option) => option === form.get("recipientScope"));
  const priority = Number(form.get("priority"));
  const senderGroup = String(form.get("senderGroup") ?? "");
  const enabled = form.get("enabled") === "on";
  const validPriority = priority === rule?.priority || (Number.isInteger(priority) && priority >= 1 && priority <= 999);
  if (version === null || !appliesTo || !scope || !validPriority) redirect(applicationUrl(id, "invalid"));
  if (senderGroup && senderGroup !== rule?.senders.groups?.[0] && !(await data.listGroups(tenantId)).some((group) => group.id === senderGroup)) {
    redirect(applicationUrl(id, "group"));
  }

  const updated = await data.updateTemplateApplication(tenantId, id, {
    ruleId: rule?.id, version, priority, appliesTo, enabled,
    senders: senderGroup ? { groups: [senderGroup] } : { all: true },
    recipients: { scope },
  });
  if (!updated) redirect(applicationUrl(id, "conflict"));
  refreshSignatures(id);
  redirect(applicationUrl(id, "saved"));
}

export async function changeVisualTemplateStatusAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const status = form.get("status");
  const version = submittedVersion(form);
  if ((status !== "draft" && status !== "published") || version === null) redirect(applicationUrl(id, "invalid"));
  const template = await data.getTemplate(tenantId, id);
  if (template?.kind !== "signature" || template.status === "archived") redirect(applicationUrl("", "invalid"));
  if (status === "published") {
    if (!hasSignatureContent(template.layout)) redirect(applicationUrl(id, "empty"));
    if (!(await data.listRules(tenantId)).some((rule) => rule.templateId === id && rule.enabled)) redirect(applicationUrl(id, "rule"));
  }
  const previous = status === "draft" ? "published" : "draft";
  if (!(await data.setVisualTemplateStatus(tenantId, id, version, status, previous))) redirect(applicationUrl(id, "conflict"));
  refreshSignatures(id);
  redirect(applicationUrl(id, status === "published" ? "published" : "unpublished"));
}

export async function changeTemplateArchiveAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const status = form.get("status");
  const version = submittedVersion(form);
  if (version === null || (status !== "archived" && status !== "draft")) redirect("/signatures?notice=conflict");

  const template = await data.getTemplate(tenantId, id);
  if (template?.kind !== "signature" || (status === "archived") === (template.status === "archived")) {
    redirect("/signatures?notice=conflict");
  }
  if (!(await data.setVisualTemplateStatus(tenantId, id, version, status, template.status))) redirect("/signatures?notice=conflict");
  refreshSignatures(id);
  redirect(status === "archived" ? "/signatures?status=archived&notice=archived" : "/signatures?status=draft&notice=restored");
}

export async function deleteArchivedSignatureAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const version = submittedVersion(form);
  const template = await data.getTemplate(tenantId, id);
  if (version === null || template?.status !== "archived" || template.kind !== "signature" || form.get("confirm") !== "yes") {
    redirect("/signatures?status=archived&notice=delete-blocked");
  }
  if (!(await data.deleteArchivedTemplate(tenantId, id, version))) redirect("/signatures?status=archived&notice=delete-blocked");
  refreshSignatures(id);
  redirect("/signatures?status=archived&notice=deleted");
}

export async function duplicateVisualTemplateAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const template = await data.getTemplate(tenantId, id);
  const parsed = parseVisualLayout(template?.layout);
  if (template?.kind !== "signature" || !parsed.layout) redirect("/signatures");
  const rule = simpleVisualRule((await data.listRules(tenantId)).filter((entry) => entry.templateId === id));
  const copyName = await uniqueCopyName(tenantId, template.name);
  const newId = await data.createTemplateWithRule(tenantId, {
    name: copyName,
    kind: "signature",
    status: "draft",
    layout: parsed.layout,
    priority: rule?.priority ?? 50,
    rule: { senders: rule?.senders ?? { all: true }, recipients: rule?.recipients ?? { scope: "any" }, appliesTo: rule?.appliesTo ?? "both" },
  });
  refreshSignatures(newId);
  redirect(`/signatures/${newId}/edit`);
}

/** Saves a signature written in HTML: creates it (with its rule) or updates an existing one. */
export async function saveHtmlTemplateAction(_prev: HtmlFormState, form: FormData): Promise<HtmlFormState> {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const html = String(form.get("html") ?? "");
  const values = { name, html, appliesTo: String(form.get("appliesTo") ?? "both"), priority: String(form.get("priority") ?? "50") };
  const errors = htmlProblems(name, html);
  const duplicate = await duplicateNameError(tenantId, name, id || undefined);
  if (duplicate) errors.push(duplicate);
  if (errors.length > 0) return { errors, values };

  let templateId = id;
  if (id) {
    const existing = await data.getTemplate(tenantId, id);
    if (!existing) return { errors: ["İmza bulunamadı; silinmiş olabilir."], values };
    await data.updateTemplate(tenantId, id, { name, layout: htmlLayout(html) });
  } else {
    const appliesTo = APPLIES.find((a) => a === form.get("appliesTo")) ?? "both";
    const priority = Math.max(1, Math.min(999, Math.round(Number(form.get("priority")) || 50)));
    templateId = await data.createTemplateWithRule(tenantId, {
      name,
      kind: "signature",
      status: "published",
      layout: htmlLayout(html),
      priority,
      rule: { senders: { all: true }, recipients: { scope: "any" }, appliesTo },
    });
  }
  revalidatePath("/signatures");
  revalidatePath(`/signatures/${templateId}`);
  revalidatePath("/");
  redirect(`/signatures/${templateId}`);
}
