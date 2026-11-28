/**
 * Sigwide signature renderer.
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
import { compactSegments, tidySpaces } from "./segments";

export { compactSegments, tidySpaces } from "./segments";

export type FieldValues = Record<string, string | null | undefined>;

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface Column {
  width?: number;
  align?: Align;
  valign?: VAlign;
  divider?: boolean;
  gapAfter?: number;
  elements: Element[];
}

export interface TextStyle {
  size?: number; // px, clamped 11..20
  bold?: boolean;
  italic?: boolean;
  color?: string; // #rrggbb
}

export type Element =
  | { type: "text"; text: string; label?: string; style?: TextStyle; href?: string; align?: Align }
  | { type: "image"; src: string; alt: string; width: number; height: number; href?: string; align?: Align }
  | { type: "divider"; color?: string }
  | { type: "spacer"; height: number }
  | { type: "social"; links: { network: string; url: string; icon: string; label: string }[]; size?: number }
  | { type: "columns"; columns: Column[]; gap?: number; dividerColor?: string; spread?: boolean }
  | { type: "html"; html: string };

export interface Layout {
  version: 1;
  fontStack: string;
  baseSize?: number;
  colors: { text: string; muted?: string; link: string; divider?: string };
  maxWidth?: number;
  elements: Element[];
  /** Settings of the editor that made this layout (e.g. the quick editor). Ignored when rendering. */
  builder?: { kind: string; config: unknown };
  /** Shorter blocks used instead of `elements` for replies and forwards. */
  reply?: Element[];
  /** Blocks added at the end only when the message goes outside the company (e.g. a legal notice). */
  externalOnly?: Element[];
}

/** The blocks to render for one message: the reply version for replies, plus the
 * outside-only blocks when a recipient is outside the company. */
export function layoutForMessage(layout: Layout, message: { reply: boolean; external: boolean }): Layout {
  const { reply, externalOnly, ...rest } = layout;
  const base = message.reply && reply?.length ? reply : layout.elements;
  const elements = message.external && externalOnly?.length ? [...base, ...externalOnly] : base;
  return { ...rest, elements };
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
  "fax_number",
  "usage_location",
  "preferred_language",
  "photo_url",
] as const;

// {{field}} or {{field|upper}}; field names may contain dots (custom.x, ext.y).
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_.]*)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi;
const SECTION = /\{\{\s*([#^])\s*([a-z][a-z0-9_.]*)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/gi;
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_URL = /^(https:\/\/|http:\/\/|mailto:|tel:)/i;

export function isSignatureImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    // Loopback media is only for inspecting uploaded logos during local development.
    const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    return nodeEnv !== "production" && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && (/^\/api\/signature-assets\/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(url.pathname)
        || /^\/api\/signature-art\/[a-z-]+-[\da-f]{6}\.png$/.test(url.pathname))
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

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

/** Fields a signature can read, including conditions and placeholders in URLs. */
export function layoutFields(layout: Layout): string[] {
  const fields = new Set<string>();

  function addPlaceholders(...sources: (string | undefined)[]) {
    for (const source of sources) {
      if (!source) continue;
      for (const field of placeholdersIn(source)) fields.add(field);
    }
  }

  function addSections(html: string) {
    for (const section of html.matchAll(SECTION)) {
      fields.add(section[2]!.toLowerCase());
      addSections(section[3]!);
    }
  }

  function visit(elements: Element[]) {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!element) continue;
      switch (element.type) {
        case "text":
          addPlaceholders(element.text, element.href);
          break;
        case "image":
          addPlaceholders(element.src, element.alt, element.href);
          break;
        case "social":
          for (const link of element.links) addPlaceholders(link.url, link.icon);
          break;
        case "html":
          addPlaceholders(element.html);
          addSections(element.html);
          break;
        case "columns":
          for (const column of element.columns) visit(column.elements);
          break;
      }
    }
  }

  visit(layout?.elements ?? []);
  return [...fields].sort();
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
  return /^tel:/i.test(filled) ? filled.replace(/\s/g, "") : filled;
}

function encodeHrefPart(s: string): string {
  // Keep literal parts of a URL and escape the attribute content.
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

function row(inner: string, align?: Align, extraStyle = ""): string {
  const alignPart = align === "center" || align === "right" ? `;text-align:${align}` : "";
  const alignAttr = align === "center" || align === "right" ? ` align="${align}"` : "";
  const style = `padding:0${extraStyle ? `;${extraStyle}` : ""}${alignPart}`;
  return `<tr><td${alignAttr} style="${style}">${inner}</td></tr>`;
}

function renderElement(ctx: Ctx, el: Element, text: string[], defaultAlign?: Align): string | null {
  const l = ctx.layout;
  switch (el.type) {
    case "text": {
      const compact = compactSegments(el.text, ctx.values);
      for (const k of compact.dropped) value(ctx, k);
      const tidy = placeholdersIn(compact.text).length > 0 ? tidySpaces : (x: string) => x;
      const filled = fill(ctx, compact.text, escapeHtml);
      if (filled === null) return null;
      const html = tidy(filled.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
      const plain = tidy(fill(ctx, compact.text, (x) => x)!);
      text.push(plain);
      const style = textStyle(ctx, el.style);
      const href = safeHref(ctx, el.href);
      const body = href
        ? `<a href="${href}" style="${style};color:${safeColor(el.style?.color, l.colors.link)};text-decoration:none">${html}</a>`
        : html;
      return row(`<span style="${style}">${body}</span>`, el.align ?? defaultAlign, style);
    }
    case "image": {
      const src = safeHref(ctx, el.src);
      if (!src || !isSignatureImageUrl(src)) return null;
      const alt = fill(ctx, el.alt, escapeHtml) ?? "";
      const w = Math.max(1, Math.min(l.maxWidth ?? 600, Math.round(el.width)));
      const h = Math.max(1, Math.round(el.height));
      const align = el.align ?? defaultAlign;
      const margin = align === "center" ? ";margin:0 auto" : align === "right" ? ";margin:0 0 0 auto" : "";
      const img = `<img src="${src}" alt="${alt}" width="${w}" height="${h}" style="display:block;border:0;width:${w}px;height:${h}px${margin}">`;
      const href = safeHref(ctx, el.href);
      return row(href ? `<a href="${href}">${img}</a>` : img, align);
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
          if (!href || !icon || !isSignatureImageUrl(icon)) return null;
          text.push(`${s.label}: ${href}`);
          return `<td style="padding:0 6px 0 0"><a href="${href}"><img src="${icon}" alt="${escapeHtml(s.label)}" width="${size}" height="${size}" style="display:block;border:0"></a></td>`;
        })
        .filter(Boolean);
      if (cells.length === 0) return null;
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join("")}</tr></table>`, defaultAlign);
    }
    case "html": {
      const html = renderHtml(ctx, el.html);
      if (!html) return null;
      const plain = htmlToText(html);
      if (plain) text.push(plain);
      return row(html, defaultAlign);
    }
    case "columns": {
      const gap = Math.max(0, Math.min(160, Math.round(el.gap ?? 16)));
      const divColor = safeColor(el.dividerColor, l.colors.divider ?? "#dddddd");
      const rendered = el.columns
        .map((col) => ({ col, inner: renderList(ctx, col.elements, text, col.align) }))
        .filter((entry): entry is { col: Column; inner: string } => entry.inner !== null);
      if (rendered.length === 0) return null;
      const autoCount = rendered.filter(({ col }) => !col.width).length;
      const autoPct = el.spread && autoCount > 0 ? Math.floor(100 / autoCount) : undefined;
      const cells: string[] = [];
      for (let i = 0; i < rendered.length; i++) {
        const { col, inner } = rendered[i]!;
        const widthAttr = col.width ? ` width="${Math.round(col.width)}"` : autoPct ? ` width="${autoPct}%"` : "";
        const valign = col.valign === "middle" || col.valign === "bottom" ? col.valign : "top";
        const align = col.align === "center" || col.align === "right" ? col.align : undefined;
        const alignAttr = align ? ` align="${align}"` : "";
        const cellStyle = [`padding:0`, `vertical-align:${valign}`];
        if (col.width) cellStyle.push(`width:${Math.round(col.width)}px`);
        if (align) cellStyle.push(`text-align:${align}`);
        cells.push(`<td${alignAttr} valign="${valign}"${widthAttr} style="${cellStyle.join(";")}">${inner}</td>`);

        if (i < rendered.length - 1) {
          const colGap = Math.max(0, Math.min(160, Math.round(col.gapAfter ?? gap)));
          const hasDivider = Boolean(rendered[i + 1]?.col.divider);
          if (hasDivider) {
            const leftHalf = Math.max(4, Math.floor(Math.max(0, colGap - 1) / 2));
            const rightHalf = Math.max(4, Math.max(0, colGap - 1) - leftHalf);
            cells.push(
              `<td width="${leftHalf}" style="width:${leftHalf}px;min-width:${leftHalf}px;padding:0;font-size:0;line-height:0">&nbsp;</td>` +
                `<td width="1" style="width:1px;border-left:1px solid ${divColor};padding:0;font-size:0;line-height:0">&nbsp;</td>` +
                `<td width="${rightHalf}" style="width:${rightHalf}px;min-width:${rightHalf}px;padding:0;font-size:0;line-height:0">&nbsp;</td>`,
            );
          } else if (colGap > 0) {
            cells.push(
              `<td width="${colGap}" style="width:${colGap}px;min-width:${colGap}px;padding:0;font-size:0;line-height:0">&nbsp;</td>`,
            );
          }
        }
      }
      const tableWidth = el.spread ? ' width="100%"' : "";
      return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"${tableWidth} style="border-collapse:collapse"><tr>${cells.join("")}</tr></table>`);
    }
  }
}

function renderList(ctx: Ctx, elements: Element[], text: string[], defaultAlign?: Align): string | null {
  const rows = elements.map((e) => renderElement(ctx, e, text, defaultAlign)).filter((r): r is string => r !== null);
  if (rows.length === 0) return null;
  const widthAttr = defaultAlign === "center" || defaultAlign === "right" ? ' width="100%"' : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${widthAttr} style="border-collapse:collapse">${rows.join("")}</table>`;
}

export function render(layout: Layout, values: FieldValues): RenderResult {
  const ctx: Ctx = { values, missing: new Set(), unknown: new Set(), layout };
  const text: string[] = [];
  const inner = renderList(ctx, layout.elements, text) ?? "";
  const maxWidth = layout.maxWidth ?? 600;
  const hasSpread = (layout.elements ?? []).some((el) => el.type === "columns" && el.spread);
  const widthAttr = hasSpread ? ' width="100%"' : "";
  const innerTable = hasSpread && inner.startsWith("<table ") ? inner.replace("<table ", '<table width="100%" ') : inner;
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${widthAttr} style="max-width:${maxWidth}px;border-collapse:collapse" data-sigwide="1"><tr><td style="padding:0">${innerTable}</td></tr></table>`;
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
