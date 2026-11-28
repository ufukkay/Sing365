"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import type { FieldValues, Layout } from "@sing365/render";
import {
  buildQuickLayout,
  DEFAULT_QUICK_CONFIG,
  LOGO_MAX,
  LOGO_MIN,
  logoHeight,
  QUICK_COLORS,
  QUICK_FIELDS,
  QUICK_FONTS,
  QUICK_SOCIAL,
  QUICK_STYLES,
  type QuickConfig,
  type QuickStyle,
} from "@/lib/quick-signature";

type Preview = { html: string; text: string; missing: string[] };
type FormState = { errors: string[] };

export interface QuickSignatureEditorProps {
  initial?: { id: string; name: string; config: QuickConfig; version: number; status: string };
  sources: { label: string; values: FieldValues }[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
  preview: (layout: Layout, values: FieldValues) => Promise<Preview>;
  /** Where "Gelişmiş düzenleyici" goes. */
  advancedHref: string;
}

const card = "rounded-lg border border-border bg-surface-raised p-4";
const stepTitle = "mb-3 flex items-center gap-2 text-sm font-semibold text-text";
const stepNumber = "inline-flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent";
const inputClass = "h-9 w-full rounded-md border border-border-input bg-bg px-3 text-sm text-text placeholder:text-text-muted";

/** A tiny drawing of each style, so the admin sees the shape before choosing. */
function StyleSketch({ style, color }: { style: QuickStyle; color: string }) {
  const bar = (w: string, strong = false) => (
    <span className="block h-1.5 rounded-sm" style={{ width: w, background: strong ? color : "var(--s365-color-border)" }} />
  );
  const logo = <span className="block h-5 w-8 rounded-sm" style={{ background: color, opacity: 0.35 }} />;
  const lines = (
    <span className="flex flex-col gap-1">
      {bar("70%", true)}
      {bar("55%")}
      {bar("40%")}
    </span>
  );
  if (style === "side") {
    return (
      <span className="flex items-center gap-2">
        {logo}
        <span className="h-8 w-px" style={{ background: color }} />
        <span className="flex-1">{lines}</span>
      </span>
    );
  }
  if (style === "classic") return <span className="flex flex-col gap-1.5">{lines}{logo}</span>;
  if (style === "logo-top") return <span className="flex flex-col gap-1.5">{logo}{lines}</span>;
  return (
    <span className="flex flex-col gap-1">
      {bar("70%", true)}
      {bar("50%")}
      <span className="my-0.5 block h-px w-full" style={{ background: color }} />
      {bar("60%")}
    </span>
  );
}

export function QuickSignatureEditor({ initial, sources, action, preview, advancedHref }: QuickSignatureEditorProps) {
  const uid = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [config, setConfig] = useState<QuickConfig>(initial?.config ?? DEFAULT_QUICK_CONFIG);
  const [source, setSource] = useState(0);
  const [result, setResult] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formState, submit, saving] = useActionState(action, { errors: [] });
  const fileRef = useRef<HTMLInputElement>(null);

  const layout = useMemo(() => buildQuickLayout(config), [config]);
  const set = (patch: Partial<QuickConfig>) => setConfig((c) => ({ ...c, ...patch }));

  // Preview with the same renderer as sent mail (debounced).
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      preview(layout, sources[source]?.values ?? {})
        .then((r) => live && setResult(r))
        .catch(() => live && setResult(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [layout, preview, source, sources]);

  async function upload(file: File) {
    setUploadError("");
    if (file.size > 512 * 1024) return setUploadError("Logo en fazla 512 KB olabilir.");
    const body = new FormData();
    body.set("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/signature-assets", { method: "POST", body });
      const asset = (await res.json().catch(() => ({}))) as { url?: string; width?: number; height?: number; error?: string };
      if (!res.ok || !asset.url || !asset.width || !asset.height) throw new Error(asset.error ?? "Logo yüklenemedi.");
      // A sensible start: wide logos 160 px, square ones 80 px.
      const width = Math.round(Math.min(LOGO_MAX, Math.max(LOGO_MIN, asset.width / asset.height >= 2 ? 160 : 80)));
      set({ logo: { src: asset.url, naturalWidth: asset.width, naturalHeight: asset.height, width } });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Logo yüklenemedi.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const socialOn = (id: string) => config.social.some((s) => s.network === id);

  return (
    <form action={submit} className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="version" value={initial.version} />
        </>
      )}
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />

      <div className="flex flex-col gap-4">
        <div className={card}>
          <label htmlFor={`${uid}-name`} className="mb-1.5 block text-sm font-semibold text-text">
            İmza adı
          </label>
          <input
            id={`${uid}-name`}
            name="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Şirket imzası"
            className={inputClass}
          />
        </div>

        <section className={card} aria-labelledby={`${uid}-s1`}>
          <h2 id={`${uid}-s1`} className={stepTitle}>
            <span className={stepNumber}>1</span> Düzen seçin
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_STYLES.map((s) => {
              const active = config.style === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ style: s.id })}
                  className={`relative flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
                    active ? "border-accent bg-accent-subtle" : "border-border bg-bg hover:bg-surface"
                  }`}
                >
                  {active && <Check aria-hidden className="absolute right-2 top-2 size-4 text-accent" />}
                  <StyleSketch style={s.id} color={config.color} />
                  <span className="text-sm font-semibold text-text">{s.title}</span>
                  <span className="-mt-1.5 text-xs text-text-muted">{s.subtitle}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={card} aria-labelledby={`${uid}-s2`}>
          <h2 id={`${uid}-s2`} className={stepTitle}>
            <span className={stepNumber}>2</span> Marka
          </h2>
          {config.style !== "minimal" && (
            <div className="mb-4">
              <p className="mb-1.5 text-sm font-medium text-text">Logo</p>
              {config.logo ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={config.logo.src} alt="Yüklenen logo" className="max-h-12 max-w-[160px] rounded border border-border bg-white p-1" />
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-accent hover:underline">
                      Değiştir
                    </button>
                    <button type="button" onClick={() => set({ logo: null })} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-danger">
                      <Trash2 size={14} /> Kaldır
                    </button>
                  </div>
                  <label htmlFor={`${uid}-logo-w`} className="flex items-center gap-3 text-xs text-text-muted">
                    Boyut
                    <input
                      id={`${uid}-logo-w`}
                      type="range"
                      min={LOGO_MIN}
                      max={LOGO_MAX}
                      value={config.logo.width}
                      onChange={(e) => set({ logo: { ...config.logo!, width: Number(e.target.value) } })}
                      className="flex-1 accent-[var(--s365-color-accent)]"
                    />
                    <span className="w-20 text-right tabular-nums">
                      {config.logo.width} × {logoHeight(config.logo)} px
                    </span>
                  </label>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-input bg-bg px-3 py-4 text-sm font-medium text-text hover:bg-surface disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                  {uploading ? "Yükleniyor…" : "Logo yükle (PNG, JPEG veya GIF, en fazla 512 KB)"}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                aria-label="Logo dosyası"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
            </div>
          )}

          <p className="mb-1.5 text-sm font-medium text-text">Ana renk</p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Renk ${c}`}
                aria-pressed={config.color === c}
                onClick={() => set({ color: c })}
                className={`size-7 rounded-full border-2 ${config.color === c ? "border-text" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
              Özel
              <input type="color" value={config.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-border bg-bg" />
            </label>
          </div>

          <label htmlFor={`${uid}-font`} className="mb-1.5 block text-sm font-medium text-text">
            Yazı tipi
          </label>
          <select id={`${uid}-font`} value={config.font} onChange={(e) => set({ font: e.target.value })} className={inputClass}>
            {QUICK_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </section>

        <section className={card} aria-labelledby={`${uid}-s3`}>
          <h2 id={`${uid}-s3`} className={stepTitle}>
            <span className={stepNumber}>3</span> Gösterilecek bilgiler
          </h2>
          <p className="mb-3 text-xs text-text-muted">
            Ad soyad her zaman görünür. Bilgiler her çalışanın Microsoft 365 kaydından gelir; boş olanlar kendiliğinden gizlenir.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {QUICK_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={config.show[f.key]}
                  onChange={(e) => set({ show: { ...config.show, [f.key]: e.target.checked } })}
                  className="size-4 accent-[var(--s365-color-accent)]"
                />
                {f.label}
              </label>
            ))}
          </div>
        </section>

        <section className={card} aria-labelledby={`${uid}-s4`}>
          <h2 id={`${uid}-s4`} className={stepTitle}>
            <span className={stepNumber}>4</span> Web sitesi ve sosyal medya <span className="font-normal text-text-muted">(isteğe bağlı)</span>
          </h2>
          <label htmlFor={`${uid}-web`} className="mb-1.5 block text-sm font-medium text-text">
            Web sitesi
          </label>
          <input
            id={`${uid}-web`}
            type="url"
            value={config.website}
            onChange={(e) => set({ website: e.target.value.trim() })}
            placeholder="https://www.firmaniz.com"
            className={`${inputClass} mb-3`}
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_SOCIAL.map((n) => (
              <button
                key={n.id}
                type="button"
                aria-pressed={socialOn(n.id)}
                onClick={() =>
                  set({
                    social: socialOn(n.id) ? config.social.filter((s) => s.network !== n.id) : [...config.social, { network: n.id, url: "" }],
                  })
                }
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  socialOn(n.id) ? "border-accent bg-accent-subtle text-accent" : "border-border text-text-muted hover:bg-surface"
                }`}
              >
                {socialOn(n.id) ? "✓ " : "+ "}
                {n.label}
              </button>
            ))}
          </div>
          {config.social.map((s) => {
            const label = QUICK_SOCIAL.find((n) => n.id === s.network)!.label;
            return (
              <input
                key={s.network}
                type="url"
                aria-label={`${label} adresi`}
                value={s.url}
                placeholder={`${label} sayfanızın adresi (https://…)`}
                onChange={(e) => set({ social: config.social.map((x) => (x.network === s.network ? { ...x, url: e.target.value.trim() } : x)) })}
                className={`${inputClass} mb-2`}
              />
            );
          })}
        </section>

        <section className={card} aria-labelledby={`${uid}-s5`}>
          <h2 id={`${uid}-s5`} className={stepTitle}>
            <span className={stepNumber}>5</span> Alt bilgi <span className="font-normal text-text-muted">(isteğe bağlı)</span>
          </h2>
          <textarea
            aria-label="Alt bilgi metni"
            value={config.disclaimer}
            maxLength={1000}
            rows={3}
            onChange={(e) => set({ disclaimer: e.target.value })}
            placeholder="Örn. Bu e-posta ve ekleri gizlidir; yalnızca alıcısı içindir."
            className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted"
          />
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <div className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">Önizleme</h2>
            {sources.length > 1 && (
              <select aria-label="Önizleme kişisi" value={source} onChange={(e) => setSource(Number(e.target.value))} className="h-8 rounded-md border border-border-input bg-bg px-2 text-xs text-text">
                {sources.map((s, i) => (
                  <option key={i} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="rounded-md border border-border bg-white p-5">
            {result ? (
              <iframe
                title="İmza önizlemesi"
                sandbox=""
                className="h-[320px] w-full"
                srcDoc={`<!doctype html><html><body style="margin:0;background:#fff">${result.html}</body></html>`}
              />
            ) : (
              <p className="py-16 text-center text-sm text-gray-500">Önizleme hazırlanıyor…</p>
            )}
          </div>
          {result && result.missing.length > 0 && (
            <p className="mt-2 text-xs text-text-muted">Bu kişide boş olduğu için gizlenen bilgiler var; diğer çalışanlarda dolu ise görünür.</p>
          )}
        </div>

        {formState.errors.length > 0 && (
          <div role="alert" className="rounded-md border border-danger bg-surface-raised p-3 text-sm text-danger">
            {formState.errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={advancedHref} className="text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
            Gelişmiş düzenleyiciyi aç
          </Link>
          <button
            type="submit"
            disabled={saving || uploading || !name.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {initial ? "Değişiklikleri kaydet" : "İmzayı kaydet"}
          </button>
        </div>
        {initial?.status === "published" && <p className="text-xs text-text-muted">Bu imza yayında; kaydettiğinizde sonraki iletilerde kullanılır.</p>}
      </div>
    </form>
  );
}
