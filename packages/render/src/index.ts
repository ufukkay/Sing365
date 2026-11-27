/**
 * Sing365 signature renderer.
 *
 * Turns a designer layout (the `templates.layout` JSON) plus one person's data
 * into email-safe HTML and a plain-text twin. Rules (replica/design/components.md §5):
 * tables only, inline styles only, no web fonts, no SVG, images with width and
 * height, and a line whose placeholders are all empty is removed.
 *
 * An "html" element carries the admin's own HTML (for organisations that already
 * have a signature design). Placeholders work there too, sections
 * {{#field}}...{{/field}} show only when the field has a value ({{^field}} when it
 * is empty), and the result is always passed through an allow-list sanitiser.
 */
import sanitizeHtml from "sanitize-html";

export type FieldValues = Record<string, string | null | undefined>;

export interface TextStyle {
  size?: number; // px, clamped 11..20
  bold?: boolean;
  italic?: boolean;
  color?: string; // #rrggbb
}

export type Element =
  | { type: "text"; text: string; style?: TextStyle; href?: string }
  | { type: "image"; src: string; alt: string; width: number; height: number; href?: string }
  | { type: "divider"; color?: string }
  | { type: "spacer"; height: number }
  | { type: "social"; links: { network: string; url: string; icon: string; label: string }[]; size?: number }
  | { type: "columns"; columns: { width?: number; elements: Element[] }[]; gap?: number }
  | { type: "html"; html: string };

export interface Layout {
  version: 1;
  fontStack: string;
  baseSize?: number;
  colors: { text: string; muted?: string; link: string; divider?: string };
  maxWidth?: number;
  elements: Element[];
}

export interface RenderResult {
  html: string;
  text: string;
  /** Placeholders that appear in the layout but have no value for this person. */
  missing: string[];
  /** Placeholders that are not known fields at all (blocks publish). */
  unknown: string[];
}

export const KNOWN_FIELDS = [
  "display_name",
  "given_name",
  "surname",
  "job_title",
  "department",
  "company_name",
  "office_location",
  "email",
  "business_phone",
  "mobile_phone",
  "street_address",
  "city",
  "state",
  "postal_code",
  "country",
  "photo_url",
] as const;

// {{field}} or {{field|upper}}; field names may contain dots (custom.x, ext.y).
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_.]*)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi;
const SECTION = /\{\{\s*([#^])\s*([a-z][a-z0-9_.]*)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/gi;
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_URL = /^(https:\/\/|http:\/\/|mailto:|tel:)/i;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isKnown(key: string): boolean {
  return (KNOWN_FIELDS as readonly string[]).includes(key) || key.startsWith("custom.") || key.startsWith("ext.");
}

/** Placeholders used in a string, in order, deduplicated. */
export function placeholdersIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(PLACEHOLDER)) {
    const k = m[1]!.toLowerCase();
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

interface Ctx {
  values: FieldValues;
  missing: Set<string>;
  unknown: Set<string>;
  layout: Layout;
}

function value(ctx: Ctx, key: string): string {
  if (!isKnown(key)) ctx.unknown.add(key);
  const v = (ctx.values[key] ?? "").trim();
  if (!v) ctx.missing.add(key);
  return v;
}

// Turkish casing (i/İ, ı/I) since most directories this serves are Turkish.
function modify(v: string, mod: string | undefined): string {
  if (mod === "upper") return v.toLocaleUpperCase("tr-TR");
  if (mod === "lower") return v.toLocaleLowerCase("tr-TR");
  return v;
}

/**
 * Fill placeholders. Returns null when the string had placeholders and every one was empty.
 * `literal` escapes the text around placeholders (identity for admin HTML), `escape` the values.
 */
function fill(ctx: Ctx, s: string, escape: (x: string) => string, literal: (x: string) => string = escape): string | null {
  const keys = placeholdersIn(s);
  const filled = new Map(keys.map((k) => [k, value(ctx, k)]));
  if (keys.length > 0 && [...filled.values()].every((v) => v === "")) return null;
  let out = "";
  let last = 0;
  for (const m of s.matchAll(PLACEHOLDER)) {
    out += literal(s.slice(last, m.index));
    out += escape(modify(filled.get(m[1]!.toLowerCase()) ?? "", m[2]?.toLowerCase()));
    last = m.index! + m[0].length;
  }
  return out + literal(s.slice(last));
}

/** Resolves {{#field}}..{{/field}} (shown when set) and {{^field}}..{{/field}} (shown when empty), innermost first. */
function sections(ctx: Ctx, s: string): string {
  let prev: string;
  let out = s;
  do {
    prev = out;
    out = out.replace(SECTION, (_m, kind: string, key: string, body: string) => {
      const has = value(ctx, key.toLowerCase()) !== "";
      return (kind === "#") === has ? body : "";
    });
  } while (out !== prev);
  return out;
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    "div", "p", "span", "br", "hr", "a", "img", "b", "strong", "i", "em", "u", "s", "small", "sup", "sub", "font", "center",
  ],
  allowedAttributes: {
    "*": ["style", "align", "valign", "width", "height", "bgcolor", "border", "dir", "title"],
    a: ["href", "target", "name"],
    img: ["src", "alt"],
    table: ["cellpadding", "cellspacing", "role"],
    td: ["colspan", "rowspan", "nowrap"],
    th: ["colspan", "rowspan", "nowrap"],
    font: ["color", "face", "size"],
  },
  allowedSchemes: ["https", "http", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Drop style declarations that can load or run anything.
    "*": (tagName, attribs) => {
      if (attribs.style && /expression|url\s*\(|javascript:|behavior|@import/i.test(attribs.style)) {
        const { style: _drop, ...rest } = attribs;
        return { tagName, attribs: rest };
      }
      return { tagName, attribs };
    },
  },
};

/** Admin HTML with placeholders -> safe HTML. Values are escaped; the result is sanitised as a whole. */
function renderHtml(ctx: Ctx, source: string): string {
  const filled = fill(ctx, sections(ctx, source), escapeHtml, (x) => x) ?? "";
  return sanitizeHtml(filled, SANITIZE).trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function safeColor(c: string | undefined, fallback: string): string {
  return c && HEX.test(c) ? c : fallback;
}

function safeHref(ctx: Ctx, href: string | undefined): string | null {
  if (!href) return null;
  const filled = fill(ctx, href, encodeHrefPart);
  if (!filled || !SAFE_URL.test(filled)) return null;
  return filled;
}

function encodeHrefPart(s: string): string {
  // literal parts of a URL are kept, values are attribute-escaped; spaces dropped for tel:
  return escapeHtml(s);
}

function clampSize(n: number | undefined, base: number): number {
  const v = n ?? base;
  return Math.min(20, Math.max(11, Math.round(v)));
}

function textStyle(ctx: Ctx, st: TextStyle | undefined): string {
  const l = ctx.layout;
  const parts = [
    `font-family:${l.fontStack}`,
    `font-size:${clampSize(st?.size, l.baseSize ?? 13)}px`,
    "line-height:1.35",
    `color:${safeColor(st?.color, l.colors.text)}`,
  ];
  if (st?.bold) parts.push("font-weight:bold");
  if (st?.italic) parts.push("font-style:italic");
  return parts.join(";");
}

function row(inner: string): string {
  return `<tr><td style="padding:0">${inner}</td></tr>`;
}

function renderElement(ctx: Ctx, el: Element, text: string[]): string | null {
  const l = ctx.layout;
  switch (el.type) {
    case "text": {
      const html = fill(ctx, el.text, escapeHtml);
      if (html === null) return null;
      const plain = fill(ctx, el.text, (x) => x)!;
      text.push(plain);
      const style = textStyle(ctx, el.style);
      const href = safeHref(ctx, el.href);
      const body = href
        ? `<a href="${href}" style="${style};color:${safeColor(el.style?.color, l.colors.link)};text-decoration:none">${html}</a>`
        : html;
      return row(`<span style="${style}">${body}</span>`);
    }
    case "image": {
      const src = safeHref(ctx, el.src);
      if (!src || !/^https:\/\//i.test(src)) return null; // hosted HTTPS images only
      const alt = fill(ctx, el.alt, escapeHtml) ?? "";
      const w = Math.max(1, Math.min(l.maxWidth ?? 600, Math.round(el.width)));
      const h = Math.max(1, Math.round(el.height));
      const img = `<img src="${src}" alt="${alt}" width="${w}" height="${h}" style="display:block;border:0;width:${w}px;height:${h}px">`;
      const href = safeHref(ctx, el.href);
      return row(href ? `<a href="${href}">${img}</a>` : img);
    }
    case "divider": {
      const c = safeColor(el.color, l.colors.divider ?? "#dddddd");
      text.push("--");
      return `<tr><td style="padding:6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${c};font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table></td></tr>`;
    }
    case "spacer": {
      const h = Math.max(1, Math.min(48, Math.round(el.height)));
      return `<tr><td style="height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr>`;
    }
    case "social": {
      const size = Math.max(12, Math.min(32, el.size ?? 20));
      const cells = el.links
        .map((s) => {
          const href = safeHref(ctx, s.url);
          const icon = safeHref(ctx, s.icon);
          if (!href || !icon || !/^https:\/\//i.test(icon)) return null;
          text.push(`${s.label}: ${href}`);
          return `<td style="padding:0 6px 0 0"><a href="${href}"><img src="${icon}" alt="${escapeHtml(s.label)}" width="${size}" height="${size}" style="display:block;border:0"></a></td>`;
        })
        .filter(Boolean);
      if (cells.length === 0) return null;
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join("")}</tr></table>`);
    }
    case "html": {
      const html = renderHtml(ctx, el.html);
      if (!html) return null;
      const plain = htmlToText(html);
      if (plain) text.push(plain);
      return row(html);
    }
    case "columns": {
      const gap = Math.max(0, Math.min(32, el.gap ?? 16));
      const cols = el.columns
        .map((c, i) => {
          const inner = renderList(ctx, c.elements, text);
          if (!inner) return null;
          const width = c.width ? ` width="${Math.round(c.width)}"` : "";
          const pad = i < el.columns.length - 1 ? `padding:0 ${gap}px 0 0;` : "";
          return `<td valign="top"${width} style="${pad}vertical-align:top">${inner}</td>`;
        })
        .filter(Boolean);
      if (cols.length === 0) return null;
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cols.join("")}</tr></table>`);
    }
  }
}

function renderList(ctx: Ctx, elements: Element[], text: string[]): string | null {
  const rows = elements.map((e) => renderElement(ctx, e, text)).filter((r): r is string => r !== null);
  if (rows.length === 0) return null;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows.join("")}</table>`;
}

export function render(layout: Layout, values: FieldValues): RenderResult {
  const ctx: Ctx = { values, missing: new Set(), unknown: new Set(), layout };
  const text: string[] = [];
  const inner = renderList(ctx, layout.elements, text) ?? "";
  const maxWidth = layout.maxWidth ?? 600;
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;border-collapse:collapse" data-sing365="1"><tr><td style="padding:0">${inner}</td></tr></table>`;
  return {
    html,
    text: text.join("\n"),
    missing: [...ctx.missing].sort(),
    unknown: [...ctx.unknown].sort(),
  };
}

/** Validation the designer runs before publish (components.md §3). */
export function validateLayout(layout: Layout): string[] {
  const errors: string[] = [];
  const walk = (els: Element[]) => {
    for (const el of els) {
      if (el.type === "image") {
        if (!el.alt.trim()) errors.push("Every image needs alt text.");
        if (el.width > (layout.maxWidth ?? 600)) errors.push(`Image is wider than ${layout.maxWidth ?? 600}px.`);
      }
      if (el.type === "text") {
        for (const k of placeholdersIn(el.text)) if (!isKnown(k)) errors.push(`Unknown field {{${k}}}.`);
      }
      if (el.type === "html") {
        for (const k of placeholdersIn(el.html)) if (!isKnown(k)) errors.push(`Unknown field {{${k}}}.`);
        for (const m of el.html.matchAll(SECTION)) if (!isKnown(m[2]!.toLowerCase())) errors.push(`Unknown field {{${m[2]}}}.`);
        if (/<script|\son[a-z]+\s*=|javascript:/i.test(el.html)) errors.push("Scripts and event handlers are removed from signatures.");
      }
      if (el.type === "columns") el.columns.forEach((c) => walk(c.elements));
    }
  };
  walk(layout.elements);
  return [...new Set(errors)];
}
