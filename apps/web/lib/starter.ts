import type { Layout } from "@sing365/render";
import type { DataLayer, NewTemplate } from "./data/types";

/**
 * Ready-made signatures so a new organisation sees its own people's signatures
 * straight after the first directory sync. Every value comes from the directory;
 * lines whose field is empty for a person are hidden by the renderer.
 */

const fontStack = "Arial, Helvetica, sans-serif";
const colors = { text: "#222222", muted: "#666666", link: "#1f5aa6", divider: "#dddddd" };

const full: Layout = {
  version: 1,
  fontStack,
  colors,
  elements: [
    { type: "text", text: "{{display_name}}", style: { size: 16, bold: true } },
    { type: "text", text: "{{job_title}}", style: { color: colors.muted } },
    { type: "text", text: "{{company_name}} · {{department}}", style: { color: colors.muted } },
    { type: "divider" },
    { type: "text", text: "T {{business_phone}}", href: "tel:{{business_phone}}" },
    { type: "text", text: "M {{mobile_phone}}", href: "tel:{{mobile_phone}}" },
    { type: "text", text: "{{email}}", href: "mailto:{{email}}" },
    { type: "text", text: "{{office_location}}", style: { size: 12, color: colors.muted } },
  ],
};

const reply: Layout = {
  version: 1,
  fontStack,
  colors,
  elements: [
    { type: "text", text: "{{display_name}} | {{job_title}}", style: { bold: true } },
    { type: "text", text: "{{company_name}}", style: { color: colors.muted } },
  ],
};

export const STARTER_TEMPLATES: NewTemplate[] = [
  {
    name: "Yanıt (kısa)",
    kind: "signature",
    status: "published",
    layout: reply,
    priority: 10,
    rule: { senders: { all: true }, recipients: { scope: "any" }, appliesTo: "reply" },
  },
  {
    name: "Kurumsal (tam)",
    kind: "signature",
    status: "published",
    layout: full,
    priority: 100,
    rule: { senders: { all: true }, recipients: { scope: "any" }, appliesTo: "both" },
  },
];

/** Adds the starter signatures unless the organisation already has one. Returns the full signature's id. */
export async function addStarterTemplates(data: DataLayer, tenantId: string): Promise<string> {
  const existing = (await data.listTemplates(tenantId)).filter((t) => t.kind === "signature");
  // Listed by priority; the last one is the catch-all, which is the one worth opening.
  const last = existing[existing.length - 1];
  if (last) return last.id;
  let fullId = "";
  for (const t of STARTER_TEMPLATES) {
    const id = await data.createTemplateWithRule(tenantId, t);
    if (t.priority === 100) fullId = id;
  }
  return fullId;
}
