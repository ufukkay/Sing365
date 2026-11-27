"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Mode } from "@sing365/rules";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { htmlLayout, htmlProblems } from "@/lib/html-template";
import { addStarterTemplates } from "@/lib/starter";

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
