import { describe, expect, it } from "vitest";
import { parseVisualLayout, templateFieldLabels } from "../lib/visual-signature";

const base = {
  version: 1,
  fontStack: "Arial, Helvetica, sans-serif",
  baseSize: 13,
  maxWidth: 600,
  colors: { text: "#172c3b", link: "#166b63", divider: "#bad7d2" },
};

describe("parseVisualLayout", () => {
  it("accepts up to 5 columns with alignment, vertical dividers and custom field labels", () => {
    const res = parseVisualLayout({
      ...base,
      elements: [
        {
          type: "columns",
          gap: 48,
          spread: true,
          dividerColor: "#cccccc",
          columns: [
            { width: 80, align: "center", valign: "middle", gapAfter: 160, elements: [{ type: "text", text: "{{display_name}}", align: "center" }] },
            { divider: true, valign: "top", elements: [{ type: "text", text: "{{ext.extensionattribute1}}", label: "Türkçe Unvan" }] },
            { elements: [{ type: "text", text: "www.pera.example", label: "Web sitesi", href: "https://pera.example" }] },
            { align: "right", elements: [{ type: "text", text: "{{mobile_phone}}" }] },
            { valign: "bottom", elements: [{ type: "text", text: "{{city}}" }] },
          ],
        },
      ],
    });
    expect(res.errors).toEqual([]);
    expect(res.layout).not.toBeNull();
    expect(templateFieldLabels(res.layout!)).toEqual({ "ext.extensionattribute1": "Türkçe Unvan" });
  });

  it("rejects more than 5 columns", () => {
    const res = parseVisualLayout({
      ...base,
      elements: [
        {
          type: "columns",
          columns: Array.from({ length: 6 }, () => ({ elements: [] })),
        },
      ],
    });
    expect(res.layout).toBeNull();
    expect(res.errors[0]).toContain("2 ile 5");
  });
});
