import type { Layout } from "@sing365/render";
import { validateLayout } from "@sing365/render";
import type { Template } from "./data/types";

/** A layout that is just the admin's own HTML. */
export function htmlLayout(html: string): Layout {
  return {
    version: 1,
    fontStack: "Arial, Helvetica, sans-serif",
    colors: { text: "#222222", link: "#1f5aa6" },
    maxWidth: 600,
    elements: [{ type: "html", html }],
  };
}

/** The HTML of a template made from HTML, or null for designer templates. */
export function htmlOf(t: Pick<Template, "layout">): string | null {
  const els = t.layout.elements;
  return els.length === 1 && els[0]?.type === "html" ? els[0].html : null;
}

export const MAX_HTML = 100_000;

/** Problems that block saving, in Turkish. */
export function htmlProblems(name: string, html: string): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push("İmzaya bir ad verin.");
  if (name.length > 120) out.push("Ad en fazla 120 karakter olabilir.");
  if (!html.trim()) out.push("HTML boş olamaz.");
  if (html.length > MAX_HTML) out.push("HTML en fazla 100 KB olabilir.");
  for (const e of validateLayout(htmlLayout(html))) {
    const unknown = /^Unknown field (\{\{.+\}\})\.$/.exec(e);
    if (unknown) out.push(`Bilinmeyen alan: ${unknown[1]}. Aşağıdaki listeden bir alan kullanın.`);
    else if (e.startsWith("Scripts")) out.push("Betikler (script) ve onclick gibi olaylar imzada çalışmaz; HTML'den çıkarın.");
    else out.push(e);
  }
  return [...new Set(out)];
}

/** Fields an admin can use, with a Turkish label. */
export const FIELD_HELP: { key: string; label: string }[] = [
  { key: "given_name", label: "Ad" },
  { key: "surname", label: "Soyad" },
  { key: "display_name", label: "Görünen ad" },
  { key: "job_title", label: "Unvan" },
  { key: "department", label: "Departman" },
  { key: "company_name", label: "Şirket" },
  { key: "office_location", label: "Ofis" },
  { key: "email", label: "E-posta" },
  { key: "business_phone", label: "İş telefonu" },
  { key: "mobile_phone", label: "Cep telefonu" },
  { key: "street_address", label: "Açık adres" },
  { key: "city", label: "Şehir / ilçe" },
  { key: "state", label: "İl / eyalet" },
  { key: "postal_code", label: "Posta kodu" },
  { key: "country", label: "Ülke" },
];
