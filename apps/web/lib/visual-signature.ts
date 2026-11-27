import { isSignatureImageUrl, validateLayout, type Element, type FieldValues, type Layout, type TextStyle } from "@sing365/render";
import type { Rule } from "@sing365/rules";

export const visualFields: { key: string; label: string; group: string }[] = [
  { key: "display_name", label: "Görünen ad", group: "Kimlik" },
  { key: "given_name", label: "Ad", group: "Kimlik" },
  { key: "surname", label: "Soyad", group: "Kimlik" },
  { key: "job_title", label: "Unvan", group: "Kimlik" },
  { key: "department", label: "Departman", group: "Kimlik" },
  { key: "company_name", label: "Şirket", group: "Kimlik" },
  { key: "email", label: "E-posta", group: "İletişim" },
  { key: "business_phone", label: "İş telefonu", group: "İletişim" },
  { key: "mobile_phone", label: "Cep telefonu", group: "İletişim" },
  { key: "office_location", label: "Ofis", group: "Konum" },
  { key: "street_address", label: "Açık adres", group: "Konum" },
  { key: "city", label: "Şehir", group: "Konum" },
  { key: "state", label: "İl / eyalet", group: "Konum" },
  { key: "postal_code", label: "Posta kodu", group: "Konum" },
  { key: "country", label: "Ülke", group: "Konum" },
  ...Array.from({ length: 15 }, (_, index) => ({
    key: `ext.extensionattribute${index + 1}`,
    label: `Uzantı alanı ${index + 1}`,
    group: "Özel alanlar",
  })),
];

const starterLayout: Layout = {
  version: 1,
  fontStack: "Arial, Helvetica, sans-serif",
  baseSize: 13,
  colors: { text: "#233047", link: "#174e9b", divider: "#c9d7ea" },
  maxWidth: 440,
  elements: [],
};

export const visualProfiles: { id: string; label: string; description: string; layout: Layout; appliesTo?: Rule["appliesTo"] }[] = [
  {
    id: "full",
    label: "Kurumsal",
    description: "Ad, unvan, şirket ve iletişim bilgileri",
    appliesTo: "new",
    layout: {
      ...starterLayout,
      elements: [
        { type: "text", text: "{{display_name}}", style: { size: 18, bold: true } },
        { type: "text", text: "{{job_title}}" },
        { type: "text", text: "{{company_name}}", style: { bold: true, color: "#174e9b" } },
        { type: "divider" },
        { type: "text", text: "{{business_phone}}", href: "tel:{{business_phone}}" },
        { type: "text", text: "{{email}}", href: "mailto:{{email}}" },
        { type: "text", text: "{{office_location}}" },
      ],
    },
  },
  {
    id: "reply",
    label: "Kısa yanıt",
    description: "Yanıtlar ve iletmeler için kısa bir imza",
    appliesTo: "reply",
    layout: {
      ...starterLayout,
      elements: [
        { type: "text", text: "{{display_name}}", style: { bold: true } },
        { type: "text", text: "{{job_title}}" },
        { type: "text", text: "{{email}}", href: "mailto:{{email}}" },
      ],
    },
  },
  { id: "blank", label: "Boş tasarım", description: "Alanları ve blokları kendiniz ekleyin", layout: starterLayout },
];

export const visualSampleSources: { label: string; values: FieldValues }[] = [
  {
    label: "Ayşe Yılmaz · Örnek kişi",
    values: {
      display_name: "Ayşe Yılmaz",
      given_name: "Ayşe",
      surname: "Yılmaz",
      job_title: "Operasyon Müdürü",
      department: "Operasyon",
      company_name: "Pera Lojistik",
      office_location: "İstanbul Merkez Ofisi",
      email: "ayse.yilmaz@pera.example",
      business_phone: "+90 212 000 00 01",
      mobile_phone: "+90 500 000 00 01",
      street_address: "Örnek Mahallesi, Kuzey Sokak No. 8",
      city: "İstanbul",
      state: "İstanbul",
      postal_code: "34000",
      country: "Türkiye",
      "ext.extensionattribute1": "Operasyon Müdürü",
    },
  },
  {
    label: "Mert Akın · Eksik alanları göster",
    values: {
      display_name: "Mert Akın",
      given_name: "Mert",
      surname: "Akın",
      email: "mert.akin@pera.example",
      company_name: "Pera Lojistik",
    },
  },
];

type VisualLayoutResult = { layout: Layout; errors: [] } | { layout: null; errors: string[] };

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function readText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`${field} metni en fazla ${max} karakter olabilir.`);
  }
  return value;
}

function integer(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} ${min} ile ${max} arasında bir tam sayı olmalı.`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} açık veya kapalı olmalı.`);
  return value;
}

function color(value: unknown): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new Error("Geçerli bir renk seçin.");
  return value;
}

function fontStack(value: unknown): string {
  const message = "Geçerli bir yazı tipi seçin.";
  if (typeof value !== "string" || value.length > 150) throw new Error(message);
  const fonts = value.split(",").map((font) => font.trim().replace(/^(['"])(.+)\1$/, "$2"));
  if (fonts.length > 5 || fonts.some((font) => !/^[a-z][a-z\d -]{0,29}$/i.test(font))) throw new Error(message);
  return fonts.join(", ");
}

function webUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || /[\s\\{}\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

function readUrl(value: unknown, mode: "image" | "link"): string {
  const isImage = mode === "image";
  const label = isImage ? "Görsel adresi" : "Bağlantı adresi";
  const url = readText(value, 2_048, label).trim();
  if (webUrl(url) && (!isImage || isSignatureImageUrl(url))) return url;
  if (isImage) throw new Error("Görsel yükleyin veya geçerli bir HTTPS adresi girin.");
  if (/^mailto:\{\{\s*email\s*\}\}$/i.test(url)) return "mailto:{{email}}";
  const phoneField = /^tel:\{\{\s*(business_phone|mobile_phone)\s*\}\}$/i.exec(url);
  if (phoneField) return `tel:{{${phoneField[1]!.toLowerCase()}}}`;
  if (/^mailto:[^\s<>@\u0000-\u001f\u007f{}]+@[^\s<>@?\u0000-\u001f\u007f{}]+(?:\?[^\s<>\u0000-\u001f\u007f{}]*)?$/iu.test(url)) return url;
  if (/^tel:\+?[\d ().-]+(?:;ext=\d+)?$/iu.test(url) && /\d/.test(url)) return url.replaceAll(" ", "");
  throw new Error("Geçerli bir web, e-posta veya telefon bağlantısı girin.");
}

function readHref(value: unknown): string | undefined {
  return value === undefined || value === "" ? undefined : readUrl(value, "link");
}

function readStyle(value: unknown): TextStyle | undefined {
  if (value === undefined) return undefined;
  const style = record(value, "Metin biçimi geçersiz.");
  return {
    size: style.size === undefined ? undefined : integer(style.size, 11, 20, "Yazı boyutu"),
    bold: style.bold === undefined ? undefined : boolean(style.bold, "Kalın yazı"),
    italic: style.italic === undefined ? undefined : boolean(style.italic, "İtalik yazı"),
    color: style.color === undefined ? undefined : color(style.color),
  };
}

function readElements(value: unknown, maxWidth: number, allowColumns: boolean, count: { total: number }): Element[] {
  if (!Array.isArray(value)) throw new Error("İmza blokları okunamadı.");
  count.total += value.length;
  if (count.total > 60) throw new Error("Bir imzada en fazla 60 blok kullanabilirsiniz.");
  return value.map((item): Element => {
    const element = record(item, "İmza bloğu geçersiz.");
    switch (element.type) {
      case "text":
        return { type: "text", text: readText(element.text, 2_000, "İmza"), style: readStyle(element.style), href: readHref(element.href) };
      case "image": {
        const alt = readText(element.alt, 160, "Görsel açıklaması").trim();
        if (!alt || /\{\{|\}\}/.test(alt)) throw new Error("Görsel için kısa ve sabit bir açıklama girin.");
        return {
          type: "image",
          src: readUrl(element.src, "image"),
          alt,
          width: integer(element.width, 1, maxWidth, "Görsel genişliği"),
          height: integer(element.height, 1, 600, "Görsel yüksekliği"),
          href: readHref(element.href),
        };
      }
      case "divider":
        return { type: "divider", color: element.color === undefined ? undefined : color(element.color) };
      case "spacer":
        return { type: "spacer", height: integer(element.height, 1, 48, "Boşluk yüksekliği") };
      case "social": {
        if (!Array.isArray(element.links) || element.links.length > 8) throw new Error("Bir blokta en fazla sekiz sosyal bağlantı kullanabilirsiniz.");
        return {
          type: "social",
          size: element.size === undefined ? undefined : integer(element.size, 12, 32, "Simge boyutu"),
          links: element.links.map((item: unknown) => {
            const link = record(item, "Sosyal bağlantı geçersiz.");
            const label = readText(link.label, 60, "Bağlantı etiketi").trim();
            if (!label) throw new Error("Sosyal bağlantıya bir etiket verin.");
            return {
              network: readText(link.network, 40, "Sosyal ağ").trim(),
              label,
              url: readUrl(link.url, "link"),
              icon: readUrl(link.icon, "image"),
            };
          }),
        };
      }
      case "columns": {
        if (!allowColumns) throw new Error("Sütunların içine ikinci bir sütun bloğu eklenemez.");
        if (!Array.isArray(element.columns) || element.columns.length < 2 || element.columns.length > 3) {
          throw new Error("Bir satıra iki veya üç sütun ekleyin.");
        }
        return {
          type: "columns",
          gap: element.gap === undefined ? undefined : integer(element.gap, 0, 32, "Sütun aralığı"),
          columns: element.columns.map((item: unknown) => {
            const column = record(item, "Sütun geçersiz.");
            const width = column.width === undefined ? undefined : integer(column.width, 1, maxWidth, "Sütun genişliği");
            return { width, elements: readElements(column.elements, width ?? maxWidth, false, count) };
          }),
        };
      }
      default:
        throw new Error("Bu blok görsel düzenleyicide kullanılamaz.");
    }
  });
}

/** Parses the visual editor payload before it can be stored or rendered. */
export function parseVisualLayout(input: unknown): VisualLayoutResult {
  try {
    const source = record(input, "İmza düzeni okunamadı.");
    if (source.version !== 1) throw new Error("İmza düzeninin sürümü desteklenmiyor.");
    const colors = record(source.colors, "İmza renkleri okunamadı.");
    const maxWidth = source.maxWidth === undefined ? 600 : integer(source.maxWidth, 160, 600, "İmza genişliği");
    const layout: Layout = {
      version: 1,
      fontStack: fontStack(source.fontStack),
      baseSize: source.baseSize === undefined ? undefined : integer(source.baseSize, 11, 20, "Temel yazı boyutu"),
      colors: {
        text: color(colors.text),
        link: color(colors.link),
        muted: colors.muted === undefined ? undefined : color(colors.muted),
        divider: colors.divider === undefined ? undefined : color(colors.divider),
      },
      maxWidth,
      elements: readElements(source.elements, maxWidth, true, { total: 0 }),
    };
    const errors = validateLayout(layout).map((error) => {
      const field = /^Unknown field \{\{(.+)\}\}\.$/.exec(error);
      return field ? `“${field[1]}” kullanılabilir Entra alanlarından biri değil.` : error;
    });
    return errors.length > 0 ? { layout: null, errors } : { layout, errors: [] };
  } catch (error) {
    return { layout: null, errors: [error instanceof Error ? error.message : "İmza düzeni okunamadı."] };
  }
}

/** Only rules the visual editor can round-trip without discarding targeting data. */
export function simpleVisualRule(rules: Rule[]): Rule | undefined {
  const [rule] = rules;
  if (rules.length !== 1 || !rule) return undefined;
  if (rule.activeFrom != null || rule.activeUntil != null || Object.keys(rule.exceptions ?? {}).length > 0) return undefined;
  if (rule.recipients.domains?.length || Object.keys(rule.recipients).some((key) => key !== "scope" && key !== "domains")) return undefined;

  const { senders } = rule;
  if (Object.keys(senders).some((key) => key !== "all" && key !== "groups")) return undefined;
  const groups = senders.groups ?? [];
  if (senders.all === true && groups.length === 0) return rule;
  if (senders.all !== true && groups.length === 1 && groups[0]) return rule;
  return undefined;
}
