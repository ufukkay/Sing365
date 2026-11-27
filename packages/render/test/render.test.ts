import { describe, expect, it } from "vitest";
import { render, validateLayout, type Layout } from "../src/index";

const layout: Layout = {
  version: 1,
  fontStack: "Arial, Helvetica, sans-serif",
  colors: { text: "#222222", link: "#0b6e69", divider: "#dddddd" },
  elements: [
    { type: "text", text: "{{display_name}}", style: { size: 16, bold: true } },
    { type: "text", text: "{{job_title}} | {{department}}" },
    { type: "divider" },
    { type: "text", text: "T: {{business_phone}}", href: "tel:{{business_phone}}" },
    { type: "text", text: "M: {{mobile_phone}}", href: "tel:{{mobile_phone}}" },
    { type: "image", src: "https://img.example.com/logo.png", alt: "{{company_name}} logo", width: 120, height: 40 },
  ],
};

const full = {
  display_name: "Ayşe Yılmaz",
  job_title: "Account Manager",
  department: "Sales",
  business_phone: "+90 212 555 00 00",
  mobile_phone: "",
  company_name: "Acme",
};

describe("render", () => {
  it("fills placeholders and keeps Turkish characters", () => {
    const r = render(layout, full);
    expect(r.html).toContain("Ayşe Yılmaz");
    expect(r.html).toContain("Account Manager | Sales");
    expect(r.text.split("\n")[0]).toBe("Ayşe Yılmaz");
  });

  it("removes a line whose placeholders are all empty", () => {
    const r = render(layout, full);
    expect(r.html).not.toContain("M: ");
    expect(r.text).not.toContain("M: ");
    expect(r.missing).toContain("mobile_phone");
  });

  it("keeps a line when only some placeholders are empty", () => {
    const r = render(layout, { ...full, department: "" });
    expect(r.html).toContain("Account Manager | ");
  });

  it("escapes HTML in directory values", () => {
    const r = render(layout, { ...full, display_name: '<script>alert(1)</script>"' });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("only allows safe link schemes", () => {
    const bad: Layout = { ...layout, elements: [{ type: "text", text: "x", href: "javascript:alert(1)" }] };
    expect(render(bad, {}).html).not.toContain("javascript:");
  });

  it("drops non-HTTPS images and images with an empty source", () => {
    const l: Layout = {
      ...layout,
      elements: [
        { type: "image", src: "http://insecure/logo.png", alt: "x", width: 10, height: 10 },
        { type: "image", src: "{{photo_url}}", alt: "photo", width: 96, height: 96 },
      ],
    };
    expect(render(l, {}).html).not.toContain("<img");
  });

  it("uses tables and inline styles only, no flexbox or style blocks", () => {
    const { html } = render(layout, full);
    expect(html).toMatch(/^<table role="presentation"/);
    expect(html).not.toMatch(/<style|display:\s*flex|<svg|<div/i);
    expect(html).toContain('width="120" height="40"');
  });

  it("clamps font sizes to 11..20px", () => {
    const l: Layout = { ...layout, elements: [{ type: "text", text: "a", style: { size: 48 } }, { type: "text", text: "b", style: { size: 6 } }] };
    const { html } = render(l, {});
    expect(html).toContain("font-size:20px");
    expect(html).toContain("font-size:11px");
  });

  it("drops a column that ends up empty", () => {
    const l: Layout = {
      ...layout,
      elements: [
        {
          type: "columns",
          columns: [
            { width: 96, elements: [{ type: "image", src: "{{photo_url}}", alt: "photo", width: 96, height: 96 }] },
            { elements: [{ type: "text", text: "{{display_name}}" }] },
          ],
        },
      ],
    };
    const { html } = render(l, { display_name: "Ali" });
    expect(html).not.toContain('width="96"');
    expect(html).toContain("Ali");
  });
});

describe("validateLayout", () => {
  it("flags missing alt text, oversize images and unknown fields", () => {
    const l: Layout = {
      ...layout,
      elements: [
        { type: "image", src: "https://x/y.png", alt: " ", width: 800, height: 10 },
        { type: "text", text: "{{shoe_size}}" },
        { type: "text", text: "{{custom.pronouns}}" },
      ],
    };
    expect(validateLayout(l)).toEqual([
      "Every image needs alt text.",
      "Image is wider than 600px.",
      "Unknown field {{shoe_size}}.",
    ]);
  });
});
