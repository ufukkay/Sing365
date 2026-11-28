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

  it("keeps a line when only some placeholders are empty, without a dangling separator", () => {
    const r = render(layout, { ...full, department: "" });
    expect(r.html).toContain("Account Manager</span>");
    expect(r.html).not.toContain("Account Manager | ");
    expect(r.text).toContain("Account Manager\n");
    expect(r.missing).toContain("department");
  });

  it("drops the empty parts of a line with their separators", () => {
    const line = (text: string, values: Record<string, string>) =>
      render({ ...layout, elements: [{ type: "text", text }] }, values).text;
    expect(line("T: {{business_phone}} · M: {{mobile_phone}}", { business_phone: "1", mobile_phone: "" })).toBe("T: 1");
    expect(line("T: {{business_phone}} · M: {{mobile_phone}}", { business_phone: "", mobile_phone: "2" })).toBe("M: 2");
    expect(line("{{street_address}}, {{city}} / {{country}}", { street_address: "Kayalar Cd.", city: "", country: "Türkiye" })).toBe("Kayalar Cd. / Türkiye");
    expect(line("{{given_name}} {{surname}}", { given_name: "Ufuk", surname: "" })).toBe("Ufuk ");
    expect(line("Talay · {{department}}", { department: "BT" })).toBe("Talay · BT");
    // A line whose fields are all empty is still removed as a whole, literal parts included.
    expect(line("Talay · {{department}}", { department: "" })).toBe("");
    // Literal text with commas is left alone.
    expect(line("Kayalar Caddesi, No:10/1 · {{city}}", { city: "İstanbul" })).toBe("Kayalar Caddesi, No:10/1 · İstanbul");
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

  it("renders up to 5 columns with alignment, vertical alignment and vertical dividers", () => {
    const l: Layout = {
      ...layout,
      elements: [
        {
          type: "columns",
          gap: 12,
          dividerColor: "#cccccc",
          columns: [
            { width: 90, align: "center", valign: "middle", gapAfter: 48, elements: [{ type: "text", text: "S1" }] },
            { divider: true, align: "left", valign: "top", elements: [{ type: "text", text: "S2", label: "Türkçe Unvan" }] },
            { align: "right", valign: "bottom", gapAfter: 64, elements: [{ type: "text", text: "S3" }] },
            { elements: [{ type: "text", text: "S4", align: "center" }] },
            { elements: [{ type: "text", text: "S5" }] },
          ],
        },
      ],
    };
    const { html } = render(l, {});
    expect(html).toContain("S1");
    expect(html).toContain("S5");
    expect(html).toContain('align="center" valign="middle" width="90"');
    expect(html).toContain("border-left:1px solid #cccccc");
    expect(html).toContain('width="23" style="width:23px;min-width:23px');
    expect(html).toContain('width="64" style="width:64px;min-width:64px');
    expect(html).toContain('align="right" valign="bottom"');
    expect(html).not.toMatch(/<style|display:\s*flex|<svg|<div/i);
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

describe("html element", () => {
  const html = (h: string): Layout => ({ ...layout, elements: [{ type: "html", html: h }] });

  it("fills placeholders, upper-cases the Turkish way and keeps the admin's markup", () => {
    const r = render(html('<table><tr><td style="color:#2d2926"><b>{{given_name}} {{surname|upper}}</b></td></tr></table>'), {
      given_name: "Şirin",
      surname: "çiğdem",
    });
    expect(r.html).toContain('<td style="color:#2d2926"><b>Şirin ÇİĞDEM</b></td>');
    expect(r.text).toBe("Şirin ÇİĞDEM");
  });

  it("shows {{#field}} sections only when the field has a value, {{^field}} only when it is empty", () => {
    const h = 'T: {{business_phone}}{{#mobile_phone}} | M: {{mobile_phone}}{{/mobile_phone}}{{^mobile_phone}} (no mobile){{/mobile_phone}}';
    expect(render(html(h), { business_phone: "1", mobile_phone: "2" }).html).toContain("T: 1 | M: 2");
    const none = render(html(h), { business_phone: "1", mobile_phone: "" }).html;
    expect(none).toContain("T: 1 (no mobile)");
    expect(none).not.toContain("M:");
  });

  it("removes scripts, event handlers and unsafe links, and escapes values", () => {
    const r = render(
      html('<a href="javascript:alert(1)" onclick="x()">a</a><script>alert(2)</script><img src="http://x/y.png" alt="l"><a href="{{custom.web}}">w</a><span>{{display_name}}</span>'),
      { "custom.web": "javascript:alert(3)", display_name: "<b>x</b>" },
    );
    expect(r.html).not.toMatch(/javascript:|onclick|<script|alert\(2\)|http:\/\/x/);
    expect(r.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("drops style declarations that could load content", () => {
    const r = render(html('<td style="background:url(https://t.example/p.png)">a</td><span style="color:#ffb71b">b</span>'), {});
    expect(r.html).not.toContain("url(");
    expect(r.html).toContain('style="color:#ffb71b"');
  });

  it("flags unknown fields and scripts before publish", () => {
    const errors = validateLayout(html("{{nope}} {{#also_nope}}x{{/also_nope}} <script></script>"));
    expect(errors).toContain("Unknown field {{nope}}.");
    expect(errors).toContain("Unknown field {{also_nope}}.");
    expect(errors.some((e) => e.startsWith("Scripts"))).toBe(true);
  });
});
