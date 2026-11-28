import { describe, expect, it } from "vitest";
import { render } from "@sing365/render";
import { buildQuickLayout, DEFAULT_QUICK_CONFIG, quickConfigOf, type QuickConfig } from "../lib/quick-signature";
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
