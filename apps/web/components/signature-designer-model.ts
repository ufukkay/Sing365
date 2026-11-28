import type { Align, Column, Element, FieldValues, Layout, VAlign } from "@sing365/render";
import { compactSegments, tidySpaces } from "@sing365/render/segments";

export type ColumnsEl = Extract<Element, { type: "columns" }>;
export type Leaf = Exclude<Element, ColumnsEl>;
export type ColumnNode = {
  width?: number;
  align?: Align;
  valign?: VAlign;
  divider?: boolean;
  gapAfter?: number;
  nodes: Node[];
};
export type Node =
  | { id: string; value: Leaf }
  | { id: string; gap?: number; dividerColor?: string; spread?: boolean; columns: ColumnNode[] };
export type Lane = { owner: string; column: number } | null;
export type Located = { node: Node; lane: Lane; index: number; count: number };
export type Insert = Leaf | ColumnsEl;
export type Zone = { lane: Lane; index: number };
export type LaneOption = Zone & { key: string; label: string };
export type Preview = { html: string; text: string; missing: string[] };
export type Field = { key: string; label: string; group: string };
export type FormState = { errors: string[] };

export interface CustomFieldItem {
  id: string;
  label: string;
  source: "static" | "entra";
  entraKey?: string;
  value?: string;
  href?: string;
}

export interface StarterPreset {
  id: string;
  title: string;
  subtitle: string;
  cols: number;
  elements: Element[];
}

export const EMPTY_LAYOUT: Layout = {
  version: 1,
  fontStack: "Arial, Helvetica, sans-serif",
  baseSize: 13,
  maxWidth: 800,
  colors: { text: "#172c3b", link: "#166b63", divider: "#bad7d2" },
  elements: [],
};

export const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Segoe UI", value: "Segoe UI, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, Times New Roman, serif" },
];

export const BRAND_SWATCHES = [
  "#172c3b",
  "#475569",
  "#166b63",
  "#1d4ed8",
  "#b91c1c",
  "#d97706",
  "#0f172a",
  "#64748b",
] as const;

export const COLUMN_COUNTS = [2, 3, 4, 5] as const;
export const GAP_PRESETS = [0, 8, 16, 28, 48] as const;
export const INLINE_SEPARATORS = [
  { label: "·", value: " · " },
  { label: "|", value: " | " },
  { label: "–", value: " – " },
  { label: "Boşluk", value: " " },
] as const;

export const EXTENSION_SLOTS = Array.from({ length: 15 }, (_, index) => ({
  name: `extensionAttribute${index + 1}`,
  key: `ext.extensionattribute${index + 1}`,
  slot: index + 1,
}));

export const STARTER_PRESETS: StarterPreset[] = [
  {
    id: "classic-2col",
    title: "Klasik 2 sütun",
    subtitle: "Logo + dikey çizgi + bilgiler",
    cols: 2,
    elements: [
      {
        type: "columns",
        gap: 20,
        dividerColor: "#bad7d2",
        columns: [
          {
            valign: "middle",
            elements: [{ type: "image", src: "", alt: "Şirket logosu", width: 120, height: 44 }],
          },
          {
            divider: true,
            valign: "top",
            elements: [
              { type: "text", text: "{{display_name}}", style: { size: 15, bold: true, color: "#172c3b" } },
              { type: "text", text: "{{job_title}} · {{department}}", style: { size: 12, color: "#475569" } },
              { type: "text", text: "{{company_name}}", style: { size: 12, bold: true, color: "#166b63" } },
              { type: "spacer", height: 6 },
              { type: "text", text: "T: {{business_phone}}", href: "tel:{{business_phone}}", style: { size: 12, color: "#172c3b" } },
              { type: "text", text: "M: {{mobile_phone}}", href: "tel:{{mobile_phone}}", style: { size: 12, color: "#172c3b" } },
              { type: "text", text: "{{email}}", href: "mailto:{{email}}", style: { size: 12, color: "#166b63" } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "card-3col",
    title: "3 sütunlu kartvizit",
    subtitle: "Logo · Kimlik · İletişim",
    cols: 3,
    elements: [
      {
        type: "columns",
        gap: 24,
        dividerColor: "#cbd5e1",
        columns: [
          {
            valign: "middle",
            elements: [{ type: "image", src: "", alt: "Şirket logosu", width: 110, height: 40 }],
          },
          {
            divider: true,
            valign: "middle",
            elements: [
              { type: "text", text: "{{display_name}}", style: { size: 15, bold: true, color: "#172c3b" } },
              { type: "text", text: "{{job_title}}", style: { size: 12, color: "#475569" } },
              { type: "text", text: "{{company_name}}", style: { size: 12, bold: true, color: "#166b63" } },
            ],
          },
          {
            divider: true,
            valign: "middle",
            elements: [
              { type: "text", text: "T: {{business_phone}}", href: "tel:{{business_phone}}", style: { size: 12, color: "#172c3b" } },
              { type: "text", text: "M: {{mobile_phone}}", href: "tel:{{mobile_phone}}", style: { size: 12, color: "#172c3b" } },
              { type: "text", text: "{{email}}", href: "mailto:{{email}}", style: { size: 12, color: "#166b63" } },
              { type: "text", text: "{{city}}, {{country}}", style: { size: 11, color: "#64748b" } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "strip-4col",
    title: "4 sütunlu iletişim şeridi",
    subtitle: "Üst başlık + altta 4 sütun",
    cols: 4,
    elements: [
      { type: "text", text: "{{display_name}}", style: { size: 15, bold: true, color: "#172c3b" } },
      { type: "text", text: "{{job_title}} · {{company_name}}", style: { size: 12, color: "#475569" } },
      { type: "divider", color: "#bad7d2" },
      {
        type: "columns",
        gap: 20,
        dividerColor: "#cbd5e1",
        columns: [
          { elements: [{ type: "text", text: "T: {{business_phone}}", href: "tel:{{business_phone}}", style: { size: 12 } }] },
          { divider: true, elements: [{ type: "text", text: "M: {{mobile_phone}}", href: "tel:{{mobile_phone}}", style: { size: 12 } }] },
          { divider: true, elements: [{ type: "text", text: "{{email}}", href: "mailto:{{email}}", style: { size: 12, color: "#166b63" } }] },
          { divider: true, elements: [{ type: "text", text: "{{office_location}}", style: { size: 12, color: "#64748b" } }] },
        ],
      },
    ],
  },
  {
    id: "compact-1col",
    title: "Sade kurumsal",
    subtitle: "Temiz, tek sütunlu kısa imza",
    cols: 1,
    elements: [
      { type: "text", text: "{{display_name}}", style: { size: 15, bold: true, color: "#172c3b" } },
      { type: "text", text: "{{job_title}} · {{company_name}}", style: { size: 12, color: "#475569" } },
      { type: "divider", color: "#bad7d2" },
      { type: "text", text: "T: {{business_phone}} · M: {{mobile_phone}}", style: { size: 12, color: "#172c3b" } },
      { type: "text", text: "{{email}}", href: "mailto:{{email}}", style: { size: 12, color: "#166b63" } },
    ],
  },
];

export const FIELD_TOKEN = /\{\{\s*([a-z][a-z0-9_.]*)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi;

export function extensionKey(raw: string): string | undefined {
  const match = /^(?:ext\.)?extensionattribute([1-9]|1[0-5])$/i.exec(raw.trim());
  return match ? `ext.extensionattribute${match[1]}` : undefined;
}

export function extensionName(key: string): string {
  return key.replace(/^ext\.extensionattribute/i, "extensionAttribute");
}

export function extensionShort(key: string): string {
  const num = /^ext\.extensionattribute(\d+)$/i.exec(key)?.[1];
  return num ? `Entra #${num}` : extensionName(key);
}

export function makeColumns(count: number): ColumnsEl {
  return {
    type: "columns",
    gap: 16,
    columns: Array.from({ length: count }, () => ({ elements: [] })),
  };
}

export function toNodes(elements: Element[], prefix: string): Node[] {
  return elements.map((value, index) => {
    const id = `${prefix}-${index}`;
    return value.type === "columns"
      ? {
          id,
          gap: value.gap,
          dividerColor: value.dividerColor,
          spread: value.spread,
          columns: value.columns.map((c, i) => ({
            width: c.width,
            align: c.align,
            valign: c.valign,
            divider: c.divider,
            gapAfter: c.gapAfter,
            nodes: toNodes(c.elements, `${id}-${i}`),
          })),
        }
      : { id, value };
  });
}

export function toElements(nodes: Node[]): Element[] {
  return nodes.map((node) =>
    "value" in node
      ? node.value
      : {
          type: "columns",
          gap: node.gap,
          dividerColor: node.dividerColor,
          spread: node.spread,
          columns: node.columns.map((c): Column => ({
            width: c.width,
            align: c.align,
            valign: c.valign,
            divider: c.divider,
            gapAfter: c.gapAfter,
            elements: toElements(c.nodes),
          })),
        },
  );
}

export function cloneNodeWithPrefix(node: Node, prefix: string): Node {
  return toNodes(toElements([node]), prefix)[0]!;
}

export function visiblePreviewElements(elements: Element[]): Element[] {
  return elements
    .filter((element) => element.type !== "image" || element.src.trim())
    .map((element) =>
      element.type === "columns"
        ? { ...element, columns: element.columns.map((column) => ({ ...column, elements: visiblePreviewElements(column.elements) })) }
        : element,
    );
}

export function locate(nodes: Node[], id: string, lane: Lane = null): Located | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { node, index, count: nodes.length, lane };
    if ("columns" in node) {
      for (const [column, branch] of node.columns.entries()) {
        const match = locate(branch.nodes, id, { owner: node.id, column });
        if (match) return match;
      }
    }
  }
}

export function inLane(nodes: Node[], lane: Lane, change: (nodes: Node[]) => Node[]): Node[] {
  if (!lane) return change(nodes);
  return nodes.map((node) =>
    "columns" in node
      ? {
          ...node,
          columns: node.columns.map((column, index) => {
            if (node.id === lane.owner) return index === lane.column ? { ...column, nodes: change(column.nodes) } : column;
            return { ...column, nodes: inLane(column.nodes, lane, change) };
          }),
        }
      : node,
  );
}

export function insertAt(nodes: Node[], index: number, value: Node): Node[] {
  return [...nodes.slice(0, index), value, ...nodes.slice(index)];
}

export function laneKey(lane: Lane) {
  return lane ? `${lane.owner}/${lane.column}` : "root";
}

export function columnLanes(nodes: Node[]): LaneOption[] {
  let rowIndex = 0;
  const result: LaneOption[] = [];
  for (const node of nodes) {
    if ("columns" in node) {
      rowIndex++;
      node.columns.forEach((column, position) => {
        const lane = { owner: node.id, column: position };
        result.push({
          lane,
          index: column.nodes.length,
          key: laneKey(lane),
          label: `Sütunlu satır ${rowIndex} · Sütun ${position + 1}`,
        });
      });
    }
  }
  return result;
}

export function readField(element: Element): { key: string; prefix: string; modifier?: string } | undefined {
  if (element.type !== "text") return;
  const match = /^([^{}]*)\{\{([a-z][a-z0-9_.]*)(?:\|(upper|lower))?\}\}$/i.exec(element.text);
  if (match) return { prefix: match[1]!.replace(/ $/, ""), key: match[2]!.toLowerCase(), modifier: match[3] };
}

export function fieldElement(key: string, prefix = "", modifier?: string, label?: string): Extract<Element, { type: "text" }> {
  const placeholder = `{{${key}${modifier ? `|${modifier}` : ""}}}`;
  const scheme = key === "email" ? "mailto:" : key === "business_phone" || key === "mobile_phone" ? "tel:" : null;
  return {
    type: "text",
    text: `${prefix ? `${prefix} ` : ""}${placeholder}`,
    label: label?.trim() || undefined,
    href: scheme ? `${scheme}{{${key}}}` : undefined,
  };
}

export function extractSavedCustomFields(elements: Element[]): CustomFieldItem[] {
  const seen = new Set<string>();
  const items: CustomFieldItem[] = [];
  function walk(list: Element[]) {
    for (const el of list) {
      if (el.type === "text") {
        const field = readField(el);
        if (field && extensionKey(field.key)) {
          const id = `entra:${field.key}:${el.label ?? ""}`;
          if (!seen.has(id)) {
            seen.add(id);
            items.push({
              id,
              label: el.label?.trim() || extensionName(field.key),
              source: "entra",
              entraKey: field.key,
            });
          }
        } else if (!field && el.label?.trim()) {
          const id = `static:${el.label}:${el.text}`;
          if (!seen.has(id)) {
            seen.add(id);
            items.push({
              id,
              label: el.label.trim(),
              source: "static",
              value: el.text,
              href: el.href,
            });
          }
        }
      } else if (el.type === "columns") {
        for (const col of el.columns) walk(col.elements);
      }
    }
  }
  walk(elements);
  return items;
}

export function blockLabel(node: Node, fields: Field[]): string {
  if (!("value" in node)) return `${node.columns.length} sütunlu satır`;
  const value = node.value;
  if (value.type === "text") {
    if (value.label?.trim()) return value.label.trim();
    const field = readField(value);
    if (field) return extensionKey(field.key) ? extensionName(field.key) : fields.find((item) => item.key === field.key)?.label ?? field.key;
    const keys = [...value.text.matchAll(FIELD_TOKEN)].map((m) => m[1]!.toLowerCase());
    if (keys.length > 1) {
      return keys
        .map((k) => (extensionKey(k) ? extensionName(k) : fields.find((f) => f.key === k)?.label ?? k))
        .join(" + ");
    }
    return value.text || "Boş metin";
  }
  if (value.type === "image") return value.alt || "Logo / görsel";
  if (value.type === "divider") return "Ayırıcı çizgi";
  if (value.type === "spacer") return `Boşluk (${value.height} px)`;
  return value.type === "social" ? "Sosyal bağlantılar" : "Mevcut içerik";
}

export function blockSnippet(node: Node, profile: FieldValues): string | undefined {
  if (!("value" in node)) return undefined;
  const value = node.value;
  if (value.type === "text") {
    const { value: rendered, missing } = canvasText(value.text, profile);
    if (missing || !rendered.trim()) return "boş";
    return rendered.length > 28 ? `${rendered.slice(0, 27)}…` : rendered;
  }
  if (value.type === "image") return `${value.width}×${value.height}`;
  return undefined;
}

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("ı", "i");
}

export function canvasText(raw: string, values: FieldValues) {
  let hasField = false;
  let hasValue = false;
  const text = compactSegments(raw, values).text;
  const value = text.replace(FIELD_TOKEN, (_match, key: string, modifier?: string) => {
    hasField = true;
    const entry = values[key.toLowerCase()]?.trim() ?? "";
    hasValue ||= Boolean(entry);
    if (modifier?.toLowerCase() === "upper") return entry.toLocaleUpperCase("tr-TR");
    if (modifier?.toLowerCase() === "lower") return entry.toLocaleLowerCase("tr-TR");
    return entry;
  });
  return { value: hasField ? tidySpaces(value) : value, missing: hasField && !hasValue };
}

export function computeMissing(elements: Element[], values: FieldValues): string[] {
  const missing = new Set<string>();
  function walk(list: Element[]) {
    for (const el of list) {
      if (el.type === "text") {
        for (const match of el.text.matchAll(FIELD_TOKEN)) {
          const key = match[1]!.toLowerCase();
          if (!(values[key] ?? "").trim()) missing.add(key);
        }
      } else if (el.type === "columns") {
        for (const col of el.columns) walk(col.elements);
      }
    }
  }
  walk(elements);
  return [...missing].sort();
}

export function resizeColumns(node: Extract<Node, { columns: ColumnNode[] }>, nextCount: number): Extract<Node, { columns: ColumnNode[] }> {
  const target = Math.max(2, Math.min(5, nextCount));
  if (target === node.columns.length) return node;
  if (target > node.columns.length) {
    const added = Array.from({ length: target - node.columns.length }, (): ColumnNode => ({ nodes: [] }));
    return { ...node, columns: [...node.columns, ...added] };
  }
  const kept = node.columns.slice(0, target).map((col) => ({ ...col, nodes: [...col.nodes] }));
  const overflow = node.columns.slice(target).flatMap((col) => col.nodes);
  if (overflow.length > 0) {
    kept[kept.length - 1]!.nodes.push(...overflow);
  }
  return { ...node, columns: kept };
}

// ---- Quick line editing: several fields on one line instead of one column per field ----

type TextLeaf = Extract<Leaf, { type: "text" }>;

const NAME_KEYS = new Set(["given_name", "surname", "display_name"]);

/** Separator to put between the end of `text` and a new field: a space between name parts, else `fallback`. */
export function separatorFor(text: string, key: string, fallback: string): string {
  const last = [...text.matchAll(FIELD_TOKEN)].at(-1)?.[1]?.toLowerCase();
  return last && NAME_KEYS.has(last) && NAME_KEYS.has(key.toLowerCase()) && text.trimEnd().endsWith("}}") ? " " : fallback;
}

/** Adds `{{key}}` to the end of a text line. A combined line loses its single-field link (tel:, mailto:). */
export function appendFieldToText(block: TextLeaf, key: string, separator: string): TextLeaf {
  const token = `{{${key}}}`;
  if (!block.text.trim()) return { ...block, text: token };
  const sep = separatorFor(block.text, key, separator);
  return { ...block, text: `${block.text}${sep}${token}`, href: undefined };
}

const isTextNode = (node: Node | undefined): node is { id: string; value: TextLeaf } =>
  Boolean(node && "value" in node && node.value.type === "text");

/**
 * A row of columns that each hold at most one text line can become one line:
 * [Ad] [Soyad] -> "{{given_name}} {{surname}}". Null when the row holds anything else.
 */
export function columnsToLine(node: Node, separator: string): Node | null {
  if (!("columns" in node)) return null;
  const texts: TextLeaf[] = [];
  for (const column of node.columns) {
    if (column.nodes.length > 1) return null;
    const only = column.nodes[0];
    if (!only) continue;
    if (!isTextNode(only)) return null;
    texts.push(only.value);
  }
  if (texts.length === 0) return null;
  const first = texts[0]!;
  let text = first.text;
  for (const next of texts.slice(1)) {
    const key = [...next.text.matchAll(FIELD_TOKEN)][0]?.[1] ?? "";
    text += `${separatorFor(text, key, separator)}${next.text}`;
  }
  return { id: node.id, value: { ...first, text, label: undefined, href: texts.length === 1 ? first.href : undefined } };
}

/** Joins a text line with the text line right below it in the same place. Null when there is none. */
export function mergeWithNext(nodes: Node[], id: string, separator: string): Node[] | null {
  const at = locate(nodes, id);
  if (!at || !isTextNode(at.node)) return null;
  const current = at.node;
  let changed = false;
  const result = inLane(nodes, at.lane, (part) => {
    const index = part.findIndex((n) => n.id === id);
    const next = part[index + 1];
    if (index < 0 || !isTextNode(next)) return part;
    changed = true;
    const key = [...next.value.text.matchAll(FIELD_TOKEN)][0]?.[1] ?? "";
    const text = `${current.value.text}${separatorFor(current.value.text, key, separator)}${next.value.text}`;
    const merged: Node = { id, value: { ...current.value, text, label: undefined, href: undefined } };
    return [...part.slice(0, index), merged, ...part.slice(index + 2)];
  });
  return changed ? result : null;
}

/**
 * The 15 Entra extension boxes, trimmed to the ones that hold data for the previewed person
 * (and `keep`, the one already in use). `all` lists every box.
 */
export function visibleExtensionSlots(profile: FieldValues, all: boolean, keep?: string) {
  if (all) return EXTENSION_SLOTS;
  return EXTENSION_SLOTS.filter((slot) => slot.key === keep || Boolean(profile[slot.key]?.trim()));
}
