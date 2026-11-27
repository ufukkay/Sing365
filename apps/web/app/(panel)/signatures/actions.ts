"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { render, type Element, type FieldValues, type Layout } from "@sing365/render";
import type { Mode, Rule } from "@sing365/rules";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { htmlLayout, htmlProblems } from "@/lib/html-template";
import { addStarterTemplates } from "@/lib/starter";
import { parseVisualLayout, simpleVisualRule } from "@/lib/visual-signature";

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
  revalidatePath(`/signatures/${id}`);
  revalidatePath(`/signatures/${id}/edit`);
  revalidatePath("/");
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

export async function saveVisualTemplateAction(_prev: VisualFormState, form: FormData): Promise<VisualFormState> {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const parsed = submittedLayout(form);
  if (!parsed.layout) return { errors: parsed.errors };
  if (!name || name.length > 100) return { errors: ["İmza adı 1–100 karakter arasında olmalı."] };
  const rules = id ? await data.listRules(tenantId) : [];
  const rule = simpleVisualRule(rules.filter((entry) => entry.templateId === id));
  const appliesTo = APPLIES.find((option) => option === form.get("appliesTo")) ?? "both";
  const scope = RECIPIENTS.find((option) => option === form.get("recipientScope")) ?? "any";
  const priority = Number(form.get("priority") ?? 50);
  const senderGroup = String(form.get("senderGroup") ?? "");
  if (!id || rule) {
    if (priority !== rule?.priority && (!Number.isInteger(priority) || priority < 1 || priority > 999)) {
      return { errors: ["Öncelik 1–999 arasında olmalı."] };
    }
    if (senderGroup && senderGroup !== rule?.senders.groups?.[0] && !(await data.listGroups(tenantId)).some((group) => group.id === senderGroup)) {
      return { errors: ["Gönderen grubu bulunamadı."] };
    }
  }
  const assignment = {
    senders: senderGroup ? { groups: [senderGroup] } : { all: true },
    recipients: { scope },
    appliesTo,
  };

  let savedId = id;
  if (id) {
    const existing = await data.getTemplate(tenantId, id);
    if (existing?.kind !== "signature" || existing.status === "archived" || !parseVisualLayout(existing.layout).layout) {
      return { errors: ["Görsel imza bulunamadı veya artık düzenlenemiyor."] };
    }
    if (existing.status === "published" && !hasSignatureContent(parsed.layout)) return { errors: ["Yayındaki imzada en az bir içerik bloğu olmalı."] };
    const version = Number(form.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) return { errors: ["İmzayı yeniden açıp değişikliklerinizi kaydedin."] };
    const updated = await data.updateVisualTemplate(tenantId, id, {
      name, layout: parsed.layout, version,
      placement: rule ? { ruleId: rule.id, priority, ...assignment } : undefined,
    });
    if (!updated) return { errors: ["Bu şablon başka bir oturumda değiştirildi. İmzayı yeniden açıp tekrar deneyin."] };
  } else {
    savedId = await data.createTemplateWithRule(tenantId, {
      name, kind: "signature", status: "draft", layout: parsed.layout, priority, rule: assignment,
    });
  }
  refreshSignatures(savedId);
  redirect(`/signatures/${savedId}`);
}

function hasSignatureContent(layout: Layout): boolean {
  function hasContent(element: Element): boolean {
    if (element.type === "text") return Boolean(element.text.trim());
    if (element.type === "image") return true;
    if (element.type === "social") return element.links.length > 0;
    return element.type === "columns" && element.columns.some((column) => column.elements.some(hasContent));
  }
  return layout.elements.some(hasContent);
}

export async function changeVisualTemplateStatusAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const status = form.get("status");
  const version = Number(form.get("version"));
  if ((status !== "draft" && status !== "published") || !Number.isSafeInteger(version) || version < 1) redirect("/signatures");
  const template = await data.getTemplate(tenantId, id);
  const parsed = parseVisualLayout(template?.layout);
  if (template?.kind !== "signature" || !parsed.layout) redirect("/signatures");
  const url = `/signatures/${template.id}`;
  if (status === "published") {
    if (!hasSignatureContent(parsed.layout)) redirect(`${url}?notice=empty`);
    if (!(await data.listRules(tenantId)).some((rule) => rule.templateId === id && rule.enabled)) redirect(`${url}?notice=rule`);
  }
  if (!(await data.setVisualTemplateStatus(tenantId, id, version, status))) redirect(`${url}?notice=conflict`);
  refreshSignatures(id);
  redirect(url);
}

export async function duplicateVisualTemplateAction(form: FormData) {
  const { tenantId } = await requirePanel();
  const id = String(form.get("id") ?? "");
  const template = await data.getTemplate(tenantId, id);
  const parsed = parseVisualLayout(template?.layout);
  if (template?.kind !== "signature" || !parsed.layout) redirect("/signatures");
  const rule = simpleVisualRule((await data.listRules(tenantId)).filter((entry) => entry.templateId === id));
  const newId = await data.createTemplateWithRule(tenantId, {
    name: `${template.name.slice(0, 88)} · Kopya`,
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
