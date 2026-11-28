import { describe, expect, it } from "vitest";
import { layoutForMessage, render } from "@sing365/render";
import { applyQuickTemplate, buildQuickLayout, DEFAULT_QUICK_CONFIG, matchingQuickTemplate, QUICK_TEMPLATES, quickConfigOf, withSamples, type QuickConfig } from "../lib/quick-signature";
import { artPng } from "../lib/signature-art";
import { parseVisualLayout } from "../lib/visual-signature";

const person = {
  display_name: "Ayşe Yılmaz",
  job_title: "Operasyon Müdürü",
  department: "Operasyon",
  company_name: "Pera Lojistik",
  email: "ayse@pera.example",
  business_phone: "+90 212 000 00 01",
  mobile_phone: "",
  street_address: "Kuzey Sk. 8",
  postal_code: "",
  city: "İstanbul",
  country: "Türkiye",
};

const logo = { src: "https://cdn.example.com/logo.png", naturalWidth: 400, naturalHeight: 100, width: 120 };
const config = (patch: Partial<QuickConfig> = {}): QuickConfig => ({ ...DEFAULT_QUICK_CONFIG, ...patch });

describe("quick signature", () => {
  it("builds every style into a valid layout that keeps its choices", () => {
    for (const style of ["side", "classic", "logo-top", "minimal"] as const) {
      const built = buildQuickLayout(config({ style, logo, website: "https://pera.example", show: { ...DEFAULT_QUICK_CONFIG.show, address: true } }));
      const parsed = parseVisualLayout(JSON.parse(JSON.stringify(built)));
      expect(parsed.errors).toEqual([]);
      expect(quickConfigOf(parsed.layout)?.style).toBe(style);
    }
  });

  it("shows only the chosen fields and hides empty ones without stray separators", () => {
    const r = render(buildQuickLayout(config({ show: { ...DEFAULT_QUICK_CONFIG.show, address: true } })), person);
    expect(r.text).toContain("Ayşe Yılmaz");
    expect(r.text).toContain("Operasyon Müdürü");
    expect(r.text).not.toContain("Operasyon Müdürü ·"); // department is off by default
    expect(r.text).toContain("T: +90 212 000 00 01");
    expect(r.text).not.toContain("M:");
    expect(r.text).toContain("Kuzey Sk. 8, İstanbul / Türkiye");
  });

  it("puts the logo beside the text with a divider in the side style, with the web site as its link", () => {
    const r = render(buildQuickLayout(config({ logo, website: "https://pera.example/" })), person);
    expect(r.html).toContain('<a href="https://pera.example/"><img src="https://cdn.example.com/logo.png"');
    expect(r.html).toContain('width="120" height="30"');
    expect(r.html).toContain("border-left:1px solid #166b63");
    expect(r.text).toContain("pera.example");
  });

  it("adds social links and the disclaimer", () => {
    const r = render(
      buildQuickLayout(config({ social: [{ network: "linkedin", url: "https://www.linkedin.com/company/pera" }], disclaimer: "Bu e-posta gizlidir." })),
      person,
    );
    expect(r.html).toContain('href="https://www.linkedin.com/company/pera"');
    expect(r.text.trim().endsWith("Bu e-posta gizlidir.")).toBe(true);
  });

  it("rebuilds the blocks on the server from the choices, ignoring blocks sent alongside", () => {
    const built = buildQuickLayout(config());
    const tampered = { ...built, elements: [{ type: "text", text: "Sahte içerik" }] };
    const parsed = parseVisualLayout(JSON.parse(JSON.stringify(tampered)));
    expect(JSON.stringify(parsed.layout)).not.toContain("Sahte içerik");
  });

  it("refuses bad choices with a clear message", () => {
    const bad = (patch: Record<string, unknown>) => parseVisualLayout({ ...buildQuickLayout(config()), builder: { kind: "quick", config: { ...config(), ...patch } } }).errors[0];
    expect(bad({ website: "javascript:alert(1)" })).toMatch(/Web sitesi/);
    expect(bad({ social: [{ network: "linkedin", url: "ftp://x" }] })).toMatch(/LinkedIn/);
    expect(bad({ logo: { ...logo, src: "http://evil.example/x.png" } })).toMatch(/Logoyu/);
    expect(bad({ disclaimer: "{{email}}" })).toMatch(/\{\{ \}\}/);
    expect(bad({ font: "Comic Sans" })).toMatch(/yazı tipi/);
  });
});

describe("ready-made examples and social icons", () => {
  it("shows social links as brand-coloured icons when the panel address is known", () => {
    const built = buildQuickLayout(config({ color: "#1d4ed8", social: [{ network: "linkedin", url: "https://www.linkedin.com/company/pera" }] }), "https://app.sigwide.example");
    const r = render(built, person);
    expect(r.html).toContain('src="https://app.sigwide.example/api/signature-art/linkedin-1d4ed8.png"');
    expect(r.html).toContain('href="https://www.linkedin.com/company/pera"');
    expect(parseVisualLayout(JSON.parse(JSON.stringify(built))).errors).toEqual([]);
  });

  it("keeps a chosen network without an address but does not show it", () => {
    const built = buildQuickLayout(config({ social: [{ network: "x", url: "" }] }), "https://app.sigwide.example");
    const parsed = parseVisualLayout(JSON.parse(JSON.stringify(built)));
    expect(parsed.errors).toEqual([]);
    expect(quickConfigOf(parsed.layout)?.social).toEqual([{ network: "x", url: "" }]);
    expect(render(parsed.layout!, person).html).not.toContain("signature-art");
  });

  it("switching examples changes the look but keeps the logo, web site and filled links", () => {
    const mine = config({ logo, website: "https://pera.example", social: [{ network: "facebook", url: "https://facebook.com/pera" }] });
    for (const t of QUICK_TEMPLATES) {
      const next = applyQuickTemplate(mine, t);
      expect(next.style).toBe(t.config.style);
      expect(next.logo).toEqual(logo);
      expect(next.website).toBe("https://pera.example");
      expect(next.social[0]).toEqual({ network: "facebook", url: "https://facebook.com/pera" });
      expect(matchingQuickTemplate(next)?.id).toBe(t.id);
      const built = buildQuickLayout(withSamples(next, "https://app.sigwide.example").config, "https://app.sigwide.example");
      expect(parseVisualLayout(JSON.parse(JSON.stringify(built))).errors).toEqual([]);
    }
  });

  it("fills only the preview with a sample logo and links", () => {
    const { config: filled, used } = withSamples(config({ social: [{ network: "linkedin", url: "" }] }), "https://app.sigwide.example");
    expect(used).toBe(true);
    expect(filled.logo?.src).toBe("https://app.sigwide.example/api/signature-art/sample-logo-166b63.png");
    expect(filled.social[0]!.url).toMatch(/^https:\/\/www\.linkedin\.com\//);
    expect(withSamples(config({ logo, website: "https://pera.example" }), null).used).toBe(false);
  });
});

describe("signature art", () => {
  it("draws valid PNG files only for known names", () => {
    const png = artPng("instagram-0f172a.png")!;
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(60);
    expect(artPng("sample-logo-166b63.png")!.readUInt32BE(16)).toBe(480);
    for (const bad of ["instagram-0f172a.svg", "tiktok-000000.png", "linkedin-12345.png", "../linkedin-000000.png", "linkedin-ABCDEF.png"]) {
      expect(artPng(bad)).toBeNull();
    }
  });
});

describe("replies and outside-only footer", () => {
  it("uses the short version for replies and keeps the full one for new mail", () => {
    const built = buildQuickLayout(config({ logo, replyStyle: "short", disclaimer: "Gizlidir." }));
    const parsed = parseVisualLayout(JSON.parse(JSON.stringify(built))).layout!;
    const reply = render(layoutForMessage(parsed, { reply: true, external: true }), person);
    const fresh = render(layoutForMessage(parsed, { reply: false, external: true }), person);
    expect(reply.text).toContain("Ayşe Yılmaz");
    expect(reply.text).toContain("Operasyon Müdürü · Pera Lojistik");
    expect(reply.text).toContain("T: +90 212 000 00 01 · ayse@pera.example");
    expect(reply.text).toContain("Gizlidir.");
    expect(reply.html).not.toContain("logo.png");
    expect(fresh.html).toContain("logo.png");
  });

  it("adds an outside-only footer only when a recipient is outside", () => {
    const built = buildQuickLayout(config({ disclaimer: "Yasal uyarı.", disclaimerScope: "external" }));
    const parsed = parseVisualLayout(JSON.parse(JSON.stringify(built))).layout!;
    expect(render(layoutForMessage(parsed, { reply: false, external: true }), person).text).toContain("Yasal uyarı.");
    expect(render(layoutForMessage(parsed, { reply: false, external: false }), person).text).not.toContain("Yasal uyarı.");
    expect(quickConfigOf(parsed)?.disclaimerScope).toBe("external");
  });

  it("reads older quick signatures without the new choices as full signatures", () => {
    const { disclaimerScope: _a, replyStyle: _b, ...old } = config();
    const parsed = parseVisualLayout({ ...buildQuickLayout(config()), builder: { kind: "quick", config: old } });
    expect(parsed.errors).toEqual([]);
    expect(quickConfigOf(parsed.layout)).toMatchObject({ disclaimerScope: "all", replyStyle: "full" });
    expect(parsed.layout!.reply).toBeUndefined();
  });
});

describe("fax", () => {
  it("adds the fax to the phone line when chosen and drops it when empty", () => {
    const show = { ...DEFAULT_QUICK_CONFIG.show, fax_number: true };
    expect(render(buildQuickLayout(config({ show })), { ...person, fax_number: "+90 212 000 00 99" }).text).toContain("T: +90 212 000 00 01 · F: +90 212 000 00 99");
    expect(render(buildQuickLayout(config({ show })), person).text).not.toContain("F:");
  });
});
