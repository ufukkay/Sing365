// "Hızlı imza": a signature made from a few choices (layout, logo, colour, which fields to show)
// instead of placing blocks by hand. The choices are stored with the layout (`builder`) so the
// quick editor can open it again; the server always rebuilds the blocks from the choices.
// No server-only imports: the editor runs this in the browser for its preview.
import type { Element, Layout } from "@sing365/render";

export const QUICK_STYLES = [
  { id: "side", title: "Logo solda", subtitle: "Logo, dikey çizgi, bilgiler" },
  { id: "classic", title: "Klasik", subtitle: "Bilgiler üstte, logo altta" },
  { id: "logo-top", title: "Logo üstte", subtitle: "Logo, altında bilgiler" },
  { id: "minimal", title: "Sade", subtitle: "Logosuz, kısa ve temiz" },
] as const;
export type QuickStyle = (typeof QUICK_STYLES)[number]["id"];

export const QUICK_FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Segoe UI", value: "Segoe UI, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, Times New Roman, serif" },
] as const;

export const QUICK_COLORS = ["#166b63", "#1d4ed8", "#0f172a", "#b91c1c", "#d97706", "#7c3aed", "#0e7490", "#475569"] as const;

/** Directory fields the admin can switch on or off. The name is always shown. */
export const QUICK_FIELDS = [
  { key: "job_title", label: "Unvan" },
  { key: "department", label: "Departman" },
  { key: "company_name", label: "Şirket adı" },
  { key: "business_phone", label: "İş telefonu" },
  { key: "mobile_phone", label: "Cep telefonu" },
  { key: "email", label: "E-posta" },
  { key: "address", label: "Adres" },
] as const;
export type QuickField = (typeof QUICK_FIELDS)[number]["key"];

export const QUICK_SOCIAL = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
] as const;
export type QuickSocial = (typeof QUICK_SOCIAL)[number]["id"];

export interface QuickLogo {
  src: string;
  /** Natural size of the uploaded image, for the aspect ratio. */
  naturalWidth: number;
  naturalHeight: number;
  /** Shown width in px. */
  width: number;
}

export interface QuickConfig {
  style: QuickStyle;
  color: string;
  font: string;
  logo: QuickLogo | null;
  show: Record<QuickField, boolean>;
  /** Company web site, shown as a link and used as the logo's link. */
  website: string;
  social: { network: QuickSocial; url: string }[];
  /** Small text under the signature (legal notice, confidentiality). */
  disclaimer: string;
}

export const DEFAULT_QUICK_CONFIG: QuickConfig = {
  style: "side",
  color: QUICK_COLORS[0],
  font: QUICK_FONTS[0].value,
  logo: null,
  show: {
    job_title: true,
    department: false,
    company_name: true,
    business_phone: true,
    mobile_phone: true,
    email: true,
    address: false,
  },
  website: "",
  social: [],
  disclaimer: "",
};

export const LOGO_MIN = 40;
export const LOGO_MAX = 240;

export function logoHeight(logo: QuickLogo): number {
  return Math.max(1, Math.round((logo.width * logo.naturalHeight) / Math.max(1, logo.naturalWidth)));
}

/** "https://www.firma.com/" -> "www.firma.com" */
export function displayHost(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

const TEXT = "#1f2937";
const MUTED = "#64748b";

/** Turns the choices into designer blocks. */
export function buildQuickLayout(config: QuickConfig): Layout {
  const c = config;
  const show = c.show;
  const name: Element = { type: "text", text: "{{display_name}}", style: { size: 16, bold: true, color: c.color } };
  const roleParts = [show.job_title && "{{job_title}}", show.department && "{{department}}"].filter(Boolean);
  const identity: Element[] = [name];
  if (roleParts.length) identity.push({ type: "text", text: roleParts.join(" · "), style: { size: 13, color: TEXT } });
  if (show.company_name) identity.push({ type: "text", text: "{{company_name}}", style: { size: 13, bold: true, color: TEXT } });

  const contact: Element[] = [];
  const phones = [show.business_phone && "T: {{business_phone}}", show.mobile_phone && "M: {{mobile_phone}}"].filter(Boolean);
  if (phones.length === 1) {
    const key = show.business_phone ? "business_phone" : "mobile_phone";
    contact.push({ type: "text", text: phones[0] as string, href: `tel:{{${key}}}`, style: { size: 12, color: TEXT } });
  } else if (phones.length) {
    contact.push({ type: "text", text: phones.join(" · "), style: { size: 12, color: TEXT } });
  }
  if (show.email) contact.push({ type: "text", text: "{{email}}", href: "mailto:{{email}}", style: { size: 12, color: c.color } });
  if (c.website) contact.push({ type: "text", text: displayHost(c.website), href: c.website, style: { size: 12, color: c.color } });
  if (show.address) {
    contact.push({ type: "text", text: "{{street_address}}, {{postal_code}} {{city}} / {{country}}", style: { size: 11, color: MUTED } });
  }
  for (const s of c.social) {
    const label = QUICK_SOCIAL.find((n) => n.id === s.network)?.label ?? s.network;
    contact.push({ type: "text", text: label, href: s.url, style: { size: 12, bold: true, color: c.color } });
  }

  const logo: Element | null = c.logo
    ? {
        type: "image",
        src: c.logo.src,
        alt: "Logo",
        width: c.logo.width,
        height: logoHeight(c.logo),
        href: c.website || undefined,
      }
    : null;

  const gap: Element = { type: "spacer", height: 8 };
  const textBlock: Element[] = contact.length ? [...identity, { type: "spacer", height: 6 }, ...contact] : identity;
  let elements: Element[];
  switch (c.style) {
    case "side":
      elements = logo
        ? [
            {
              type: "columns",
              gap: 24,
              dividerColor: c.color,
              columns: [
                { valign: "middle", elements: [logo] },
                { divider: true, valign: "middle", elements: textBlock },
              ],
            },
          ]
        : textBlock;
      break;
    case "classic":
      elements = logo ? [...textBlock, gap, logo] : textBlock;
      break;
    case "logo-top":
      elements = logo ? [logo, gap, ...textBlock] : textBlock;
      break;
    case "minimal":
      elements = [...identity, { type: "divider", color: c.color }, ...contact];
      break;
  }
  if (c.disclaimer.trim()) {
    elements = [...elements, { type: "spacer", height: 12 }, { type: "text", text: c.disclaimer.trim(), style: { size: 11, color: MUTED } }];
  }

  return {
    version: 1,
    fontStack: c.font,
    baseSize: 13,
    maxWidth: 600,
    colors: { text: TEXT, link: c.color, divider: c.color, muted: MUTED },
    elements,
    builder: { kind: "quick", config: c },
  };
}

// ---- Reading choices sent by the browser ----

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function httpsUrl(value: unknown, max = 500): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  const v = value.trim();
  if (!/^https?:\/\//i.test(v) || /[\s{}<>"'\\]/.test(v)) return null;
  try {
    const u = new URL(v);
    return u.hostname && !u.username && !u.password ? v : null;
  } catch {
    return null;
  }
}

/** Validates the stored choices. Throws a Turkish message for the admin when something is wrong. */
export function parseQuickConfig(input: unknown, isImageUrl: (url: string) => boolean): QuickConfig {
  if (!isRecord(input)) throw new Error("Hızlı imza ayarları okunamadı.");
  const style = QUICK_STYLES.find((s) => s.id === input.style)?.id;
  if (!style) throw new Error("Bir imza düzeni seçin.");
  if (typeof input.color !== "string" || !/^#[\da-f]{6}$/i.test(input.color)) throw new Error("Geçerli bir renk seçin.");
  const font = QUICK_FONTS.find((f) => f.value === input.font)?.value;
  if (!font) throw new Error("Listeden bir yazı tipi seçin.");

  let logo: QuickLogo | null = null;
  if (input.logo != null) {
    if (!isRecord(input.logo)) throw new Error("Logo bilgisi okunamadı.");
    const src = httpsUrl(input.logo.src, 2048);
    const nums = [input.logo.naturalWidth, input.logo.naturalHeight, input.logo.width];
    if (!src || !isImageUrl(src)) throw new Error("Logoyu yeniden yükleyin.");
    if (!nums.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 4096)) throw new Error("Logo boyutu geçersiz.");
    const width = Math.min(LOGO_MAX, Math.max(LOGO_MIN, input.logo.width as number));
    logo = { src, naturalWidth: input.logo.naturalWidth as number, naturalHeight: input.logo.naturalHeight as number, width };
    if (logoHeight(logo) > 200) throw new Error("Logo çok uzun görünüyor; genişliği küçültün.");
  }

  const show = {} as Record<QuickField, boolean>;
  const rawShow = isRecord(input.show) ? input.show : {};
  for (const f of QUICK_FIELDS) show[f.key] = rawShow[f.key] === true;

  let website = "";
  if (typeof input.website === "string" && input.website.trim()) {
    const url = httpsUrl(input.website);
    if (!url) throw new Error("Web sitesi https:// ile başlayan geçerli bir adres olmalı.");
    website = url;
  }

  if (!Array.isArray(input.social) || input.social.length > QUICK_SOCIAL.length) throw new Error("Sosyal medya bağlantıları okunamadı.");
  const social = input.social.map((item) => {
    if (!isRecord(item)) throw new Error("Sosyal medya bağlantısı okunamadı.");
    const network = QUICK_SOCIAL.find((n) => n.id === item.network)?.id;
    const url = httpsUrl(item.url);
    if (!network) throw new Error("Bilinmeyen sosyal ağ.");
    if (!url) throw new Error(`${QUICK_SOCIAL.find((n) => n.id === network)!.label} için https:// ile başlayan bir adres girin.`);
    return { network, url };
  });

  if (typeof input.disclaimer !== "string" || input.disclaimer.length > 1000) throw new Error("Alt bilgi metni en fazla 1000 karakter olabilir.");
  if (/\{\{|\}\}/.test(input.disclaimer)) throw new Error("Alt bilgi metninde {{ }} kullanılamaz.");

  return { style, color: input.color.toLowerCase(), font, logo, show, website, social, disclaimer: input.disclaimer };
}

/** The quick choices stored with a layout, if it was made in the quick editor. */
export function quickConfigOf(layout: unknown): QuickConfig | null {
  if (!isRecord(layout) || !isRecord(layout.builder) || layout.builder.kind !== "quick") return null;
  try {
    return parseQuickConfig(layout.builder.config, () => true);
  } catch {
    return null;
  }
}
