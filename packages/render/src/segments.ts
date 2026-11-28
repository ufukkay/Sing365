// Dependency-free so the panel's browser code can use it without the HTML sanitiser.
export type SegmentValues = Record<string, string | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_.]*)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi;

function keysIn(s: string): string[] {
  return [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]!.toLowerCase()))];
}

// Separators between parts of one line: " · ", " | ", " – ", " — ", " / " and ", ".
const SEGMENT_SEPARATOR = /(\s+[·|–—/]\s+|,\s+)/;

/**
 * One line can hold several parts, e.g. "T: {{business_phone}} · M: {{mobile_phone}}".
 * A part whose placeholders are all empty is dropped together with the separator before it
 * (or after it, for the first part), so "T: 0212 … · M: " never appears. When every
 * placeholder of the whole line is empty the line is returned unchanged (and then removed).
 * `dropped` lists the placeholders of the removed parts.
 */
export function compactSegments(text: string, values: SegmentValues): { text: string; dropped: string[] } {
  const has = (k: string) => Boolean((values[k] ?? "").trim());
  const all = keysIn(text);
  if (all.length === 0 || !all.some(has)) return { text, dropped: [] };
  const parts = text.split(SEGMENT_SEPARATOR);
  if (parts.length === 1) return { text, dropped: [] };
  const kept: { sep: string; seg: string }[] = [];
  const dropped: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i]!;
    const keys = keysIn(seg);
    if (keys.length > 0 && !keys.some(has)) {
      dropped.push(...keys);
      continue;
    }
    if (seg.trim() === "") continue;
    kept.push({ sep: i === 0 ? "" : parts[i - 1]!, seg });
  }
  return { text: kept.map((k, i) => (i === 0 ? "" : k.sep) + k.seg).join(""), dropped: [...new Set(dropped)] };
}

