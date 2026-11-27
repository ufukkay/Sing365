"use client";

import { Fragment, useActionState, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  Columns2,
  Copy,
  Eye,
  GripVertical,
  ImagePlus,
  Italic,
  Layers,
  Minus,
  MoveVertical,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserRound,
} from "lucide-react";
import type { Align, FieldValues, Layout, TextStyle, VAlign } from "@sing365/render";
import {
  BRAND_SWATCHES,
  COLUMN_COUNTS,
  EMPTY_LAYOUT,
  EXTENSION_SLOTS,
  FONT_OPTIONS,
  GAP_PRESETS,
  INLINE_SEPARATORS,
  STARTER_PRESETS,
  blockLabel,
  blockSnippet,
  canvasText,
  cloneNodeWithPrefix,
  columnLanes,
  computeMissing,
  extensionKey,
  extensionName,
  extensionShort,
  extractSavedCustomFields,
  fieldElement,
  inLane,
  insertAt,
  laneKey,
  locate,
  makeColumns,
  normalizeSearch,
  readField,
  resizeColumns,
  toElements,
  toNodes,
  visiblePreviewElements,
  type ColumnNode,
  type CustomFieldItem,
  type Field,
  type FormState,
  type Insert,
  type Lane,
  type Leaf,
  type Node,
  type Preview,
  type Zone,
} from "./signature-designer-model";
import styles from "./signature-designer.module.css";

export interface SignatureDesignerProps {
  initial?: { id: string; name: string; layout: Layout; status: "draft" | "published"; version: number };
  sources: { label: string; values: FieldValues }[];
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  preview: (layout: Layout, values: FieldValues) => Promise<Preview>;
  fields: Field[];
  existingNames?: string[];
}

const INSERTS: { label: string; icon: typeof Type; value: Insert }[] = [
  { label: "Metin", icon: Type, value: { type: "text", text: "Yeni metin" } },
  { label: "Logo / görsel", icon: ImagePlus, value: { type: "image", src: "", alt: "Şirket logosu", width: 120, height: 42 } },
  { label: "Ayırıcı çizgi", icon: Minus, value: { type: "divider" } },
  { label: "Boşluk", icon: MoveVertical, value: { type: "spacer", height: 10 } },
];

const HISTORY_LIMIT = 40;

function AlignButtons({ value, onChange }: { value: Align; onChange: (next: Align) => void }) {
  return (
    <div className={styles.segmented} role="group" aria-label="Yatay hizalama">
      <button type="button" title="Sola hizala" aria-pressed={value === "left"} onClick={() => onChange("left")}>
        <AlignLeft size={14} />
      </button>
      <button type="button" title="Ortala" aria-pressed={value === "center"} onClick={() => onChange("center")}>
        <AlignCenter size={14} />
      </button>
      <button type="button" title="Sağa hizala" aria-pressed={value === "right"} onClick={() => onChange("right")}>
        <AlignRight size={14} />
      </button>
    </div>
  );
}

function VAlignButtons({ value, onChange }: { value: VAlign; onChange: (next: VAlign) => void }) {
  return (
    <div className={styles.segmented} role="group" aria-label="Dikey hizalama">
      <button type="button" title="Üste hizala" aria-pressed={value === "top"} onClick={() => onChange("top")}>
        <AlignStartHorizontal size={14} />
      </button>
      <button type="button" title="Ortaya hizala" aria-pressed={value === "middle"} onClick={() => onChange("middle")}>
        <AlignCenterHorizontal size={14} />
      </button>
      <button type="button" title="Alta hizala" aria-pressed={value === "bottom"} onClick={() => onChange("bottom")}>
        <AlignEndHorizontal size={14} />
      </button>
    </div>
  );
}

function ColorSwatches({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (color: string) => void;
  compact?: boolean;
}) {
  const swatches = compact ? BRAND_SWATCHES.slice(0, 6) : BRAND_SWATCHES;
  return (
    <div className={styles.swatches} role="group" aria-label="Hazır renkler">
      {swatches.map((hex) => (
        <button
          key={hex}
          type="button"
          className={styles.swatch}
          style={{ backgroundColor: hex }}
          title={hex}
          aria-label={`Renk ${hex}`}
          aria-pressed={value.toLowerCase() === hex.toLowerCase()}
          onClick={() => onChange(hex)}
        />
      ))}
    </div>
  );
}

function LiveElementView({
  block,
  values,
  layout,
  label,
  defaultAlign,
  isSelected,
  resizingImage,
  onStartImageResize,
  onMoveImageResize,
  onEndImageResize,
}: {
  block: Leaf;
  values: FieldValues;
  layout: Layout;
  label: string;
  defaultAlign?: Align;
  isSelected: boolean;
  resizingImage: boolean;
  onStartImageResize?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMoveImageResize?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onEndImageResize?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const align = ("align" in block ? block.align : undefined) ?? defaultAlign ?? "left";
  switch (block.type) {
    case "text": {
      const { value, missing } = canvasText(block.text, values);
      if (missing || !value.trim()) {
        return (
          <div className={styles.liveAlign} style={{ textAlign: align }}>
            <span className={styles.livePlaceholder}>
              {label}
              {missing ? " · bu kişide boş" : ""}
            </span>
          </div>
        );
      }
      return (
        <div
          className={styles.liveText}
          style={{
            textAlign: align,
            fontFamily: layout.fontStack,
            fontSize: block.style?.size ?? layout.baseSize ?? 13,
            fontWeight: block.style?.bold ? 700 : 400,
            fontStyle: block.style?.italic ? "italic" : "normal",
            color: block.style?.color ?? (block.href ? layout.colors.link : layout.colors.text),
          }}
        >
          {value}
        </div>
      );
    }
    case "image": {
      const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
      if (/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/signature-assets\/)/i.test(block.src)) {
        return (
          <div className={styles.liveImageWrap} style={{ justifyContent: justify }}>
            <div className={styles.liveImageBox}>
              <img
                className={styles.liveImage}
                src={block.src}
                alt={block.alt}
                width={block.width}
                height={block.height}
                style={{ width: block.width, height: block.height }}
                draggable={false}
                referrerPolicy="no-referrer"
              />
              {isSelected && onStartImageResize && (
                <div
                  className={styles.imageResizeHandle}
                  title="Orantılı büyütüp küçültmek için köşeden sürükleyin"
                  draggable={false}
                  onPointerDown={onStartImageResize}
                  onPointerMove={onMoveImageResize}
                  onPointerUp={onEndImageResize}
                  onPointerCancel={onEndImageResize}
                />
              )}
              {resizingImage && (
                <span className={styles.imageSizeBadge}>
                  {block.width} × {block.height} px
                </span>
              )}
            </div>
          </div>
        );
      }
      return (
        <div className={styles.liveImageWrap} style={{ justifyContent: justify }}>
          <span className={styles.liveImageEmpty}>
            <ImagePlus size={14} /> {label} · yüklemek için tıklayın
          </span>
        </div>
      );
    }
    case "divider":
      return (
        <div className={styles.liveDividerWrap}>
          <span className={styles.liveDivider} style={{ backgroundColor: block.color ?? layout.colors.divider ?? "#bad7d2" }} />
        </div>
      );
    case "spacer":
      return (
        <div className={styles.liveSpacer} style={{ height: Math.max(4, Math.min(48, block.height)) }}>
          <span>{block.height} px</span>
        </div>
      );
    default:
      return <span className={styles.livePlaceholder}>{label}</span>;
  }
}

function CustomFieldCreator({
  profile,
  onCreate,
}: {
  profile: FieldValues;
  onCreate: (item: CustomFieldItem) => void;
}) {
  const uid = useId();
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<"static" | "entra">("static");
  const [staticValue, setStaticValue] = useState("");
  const [staticHref, setStaticHref] = useState("");
  const [entraKey, setEntraKey] = useState(EXTENSION_SLOTS[0]!.key);

  const canAdd = label.trim().length > 0 && (source === "entra" || staticValue.trim().length > 0);

  function submitCustom() {
    if (!canAdd) return;
    const cleanLabel = label.trim();
    if (source === "entra") {
      onCreate({
        id: `entra:${entraKey}:${Date.now()}`,
        label: cleanLabel,
        source: "entra",
        entraKey,
      });
    } else {
      onCreate({
        id: `static:${Date.now()}`,
        label: cleanLabel,
        source: "static",
        value: staticValue.trim(),
        href: staticHref.trim() || undefined,
      });
    }
    setLabel("");
    setStaticValue("");
    setStaticHref("");
  }

  return (
    <div className={styles.customCreator}>
      <label className={styles.field} htmlFor={`${uid}-label`}>
        Alan adı
        <input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Örn. Türkçe Unvan, Dahili, Web"
        />
      </label>

      <div className={styles.sourceSwitch} role="group" aria-label="Alan kaynağı">
        <button type="button" aria-pressed={source === "static"} onClick={() => setSource("static")}>
          Sabit bilgi
        </button>
        <button type="button" aria-pressed={source === "entra"} onClick={() => setSource("entra")}>
          Entra ID kutusu
        </button>
      </div>

      {source === "static" ? (
        <>
          <label className={styles.field} htmlFor={`${uid}-val`}>
            İmzada görünecek metin
            <input
              id={`${uid}-val`}
              value={staticValue}
              onChange={(e) => setStaticValue(e.target.value)}
              maxLength={300}
              placeholder="Örn. www.sirket.com"
            />
          </label>
          <label className={styles.field} htmlFor={`${uid}-href`}>
            Bağlantı <span>(isteğe bağlı)</span>
            <input
              id={`${uid}-href`}
              type="url"
              value={staticHref}
              onChange={(e) => setStaticHref(e.target.value)}
              placeholder="https://"
            />
          </label>
        </>
      ) : (
        <>
          <label className={styles.field} htmlFor={`${uid}-entra`}>
            Entra ID özel kutusu
            <select id={`${uid}-entra`} value={entraKey} onChange={(e) => setEntraKey(e.target.value)}>
              {EXTENSION_SLOTS.map((slot) => {
                const sample = profile[slot.key]?.trim();
                return (
                  <option key={slot.key} value={slot.key}>
                    {slot.name}
                    {sample ? ` · ${sample}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <p className={styles.smallNote}>
            Microsoft Entra ID standart alanlar dışındaki kişi bilgilerini (ör. Türkçe unvan, dahili) bu 15 özel kutuda tutar.
          </p>
        </>
      )}

      <button type="button" className={styles.customButton} disabled={!canAdd} onClick={submitCustom}>
        <Plus size={14} /> Oluştur ve imzaya ekle
      </button>
    </div>
  );
}

function InlineFieldAdder({
  fields,
  customFields,
  onAppendToken,
}: {
  fields: Field[];
  customFields: CustomFieldItem[];
  onAppendToken: (separator: string, fieldKey: string) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [sep, setSep] = useState<string>(INLINE_SEPARATORS[0]!.value);
  const [pickedKey, setPickedKey] = useState("department");

  const options = useMemo(() => {
    const base = fields.filter((f) => !extensionKey(f.key)).map((f) => ({ key: f.key, label: f.label }));
    const custom = customFields
      .filter((c) => c.source === "entra" && c.entraKey)
      .map((c) => ({ key: c.entraKey!, label: `${c.label} (${extensionShort(c.entraKey!)})` }));
    return [...base, ...custom];
  }, [fields, customFields]);

  if (!open) {
    return (
      <button type="button" className={styles.inlineAddTrigger} onClick={() => setOpen(true)}>
        <Plus size={13} /> Aynı satıra ikinci alan ekle (ör. Unvan · Departman)
      </button>
    );
  }

  return (
    <div className={styles.inlineAdder}>
      <div className={styles.inlineAdderHead}>
        <span>Aynı satıra alan ekle</span>
        <button type="button" onClick={() => setOpen(false)}>
          Kapat
        </button>
      </div>
      <div className={styles.inlineAdderRow}>
        <select id={`${uid}-sep`} aria-label="Ayraç" value={sep} onChange={(e) => setSep(e.target.value)}>
          {INLINE_SEPARATORS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select id={`${uid}-field`} aria-label="Eklenecek alan" value={pickedKey} onChange={(e) => setPickedKey(e.target.value)}>
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.inlineAddConfirm}
          onClick={() => {
            onAppendToken(sep, pickedKey);
            setOpen(false);
          }}
        >
          Ekle
        </button>
      </div>
    </div>
  );
}

function ImageInspector({
  block,
  maxWidth,
  update,
  onUpload,
  fileInputRef,
}: {
  block: Extract<Leaf, { type: "image" }>;
  maxWidth: number;
  update: (value: Leaf) => void;
  onUpload: (active: boolean) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const uid = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [keepRatio, setKeepRatio] = useState(true);
  const ratio = block.height > 0 ? block.width / block.height : 1;

  async function upload(file: File) {
    if (file.size > 512 * 1024) {
      setUploadError("Görsel şu an en fazla 512 KB olabilir.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    setUploading(true);
    onUpload(true);
    setUploadError("");
    try {
      const response = await fetch("/api/signature-assets", { method: "POST", body });
      const asset = (await response.json().catch(() => ({}))) as { url?: string; width?: number; height?: number; error?: string };
      if (!response.ok || !asset.url || !asset.width || !asset.height) throw new Error(asset.error ?? "Görsel yüklenemedi.");
      const isBanner = asset.width / asset.height >= 2.4;
      const targetMaxW = isBanner ? maxWidth : Math.min(maxWidth, 180);
      const targetMaxH = isBanner ? 220 : 120;
      const scale = Math.min(1, targetMaxW / asset.width, targetMaxH / asset.height);
      update({
        ...block,
        src: asset.url,
        width: Math.max(1, Math.round(asset.width * scale)),
        height: Math.max(1, Math.round(asset.height * scale)),
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Görsel yüklenemedi.");
    } finally {
      setUploading(false);
      onUpload(false);
    }
  }

  function applyWidth(nextW: number) {
    const clampedW = Math.max(16, Math.min(maxWidth, Math.round(nextW)));
    const nextH = keepRatio ? Math.max(12, Math.min(600, Math.round(clampedW / ratio))) : block.height;
    update({ ...block, width: clampedW, height: nextH });
  }

  return (
    <>
      <label className={`${styles.field} ${styles.upload}`} htmlFor={`${uid}-file`}>
        Görsel yükle (PNG, JPEG, GIF)
        <input
          ref={fileInputRef}
          id={`${uid}-file`}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {uploading && (
        <p role="status" className={styles.smallNote}>
          Görsel yükleniyor…
        </p>
      )}
      {uploadError && (
        <p role="alert" className={styles.uploadError}>
          {uploadError}
        </p>
      )}
      <div className={styles.inlineSetting}>
        <span>Hızlı boyut</span>
        <div className={styles.segmented} role="group" aria-label="Hızlı görsel genişliği">
          {[80, 120, 180, 320].map((w) => (
            <button key={w} type="button" aria-pressed={Math.abs(block.width - w) <= 4} onClick={() => applyWidth(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.inspectorRow}>
        <label className={styles.field} htmlFor={`${uid}-w`}>
          Genişlik (px)
          <input
            id={`${uid}-w`}
            type="number"
            min={1}
            max={maxWidth}
            disabled={uploading}
            value={block.width}
            onChange={(e) => applyWidth(Number(e.target.value) || 1)}
          />
        </label>
        <label className={styles.field} htmlFor={`${uid}-h`}>
          Yükseklik (px)
          <input
            id={`${uid}-h`}
            type="number"
            min={1}
            max={600}
            disabled={uploading}
            value={block.height}
            onChange={(e) => {
              const nextH = Math.max(1, Math.min(600, Number(e.target.value) || 1));
              const nextW = keepRatio ? Math.max(1, Math.min(maxWidth, Math.round(nextH * ratio))) : block.width;
              update({ ...block, width: nextW, height: nextH });
            }}
          />
        </label>
      </div>
      <label className={styles.checkbox} htmlFor={`${uid}-ratio`}>
        <input id={`${uid}-ratio`} type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} /> En-boy oranını koru
      </label>
      <div className={styles.inlineSetting}>
        <span>Hizalama</span>
        <AlignButtons value={block.align ?? "left"} onChange={(align) => update({ ...block, align })} />
      </div>
      <label className={styles.field} htmlFor={`${uid}-url`}>
        Görsel adresi
        <input id={`${uid}-url`} type="url" value={block.src} disabled={uploading} placeholder="https://" onChange={(e) => update({ ...block, src: e.target.value })} />
      </label>
      <label className={styles.field} htmlFor={`${uid}-alt`}>
        Alternatif metin
        <input id={`${uid}-alt`} value={block.alt} disabled={uploading} maxLength={100} onChange={(e) => update({ ...block, alt: e.target.value })} />
      </label>
      <label className={styles.field} htmlFor={`${uid}-href`}>
        Bağlantı <span>(isteğe bağlı)</span>
        <input
          id={`${uid}-href`}
          type="url"
          value={block.href ?? ""}
          disabled={uploading}
          placeholder="https://"
          onChange={(e) => update({ ...block, href: e.target.value || undefined })}
        />
      </label>
    </>
  );
}

function Inspector({
  active,
  selectedColumn,
  fields,
  customFields,
  profile,
  maxWidth,
  onChange,
  onUpload,
  onSelectColumn,
  imageInputRef,
}: {
  active: Node;
  selectedColumn?: number;
  fields: Field[];
  customFields: CustomFieldItem[];
  profile: FieldValues;
  maxWidth: number;
  onChange: (next: Node) => void;
  onUpload: (active: boolean) => void;
  onSelectColumn: (index: number) => void;
  imageInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const uid = useId();
  const update = (value: Leaf) => onChange({ id: active.id, value });

  if ("columns" in active) {
    const colIndex = selectedColumn !== undefined && selectedColumn < active.columns.length ? selectedColumn : 0;
    const col = active.columns[colIndex]!;
    const updateCol = (patch: Partial<ColumnNode>) =>
      onChange({
        ...active,
        columns: active.columns.map((item, idx) => (idx === colIndex ? { ...item, ...patch } : item)),
      });

    return (
      <>
        <div className={styles.inlineSetting}>
          <span>Sütun sayısı</span>
          <div className={styles.segmented} role="group" aria-label="Sütun sayısı">
            {COLUMN_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={active.columns.length === count}
                onClick={() => onChange(resizeColumns(active, count))}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.inlineSetting}>
          <span>Yerleşim genişliği</span>
          <div className={styles.segmented} role="group" aria-label="Sütun yerleşim genişliği">
            <button type="button" aria-pressed={!active.spread} onClick={() => onChange({ ...active, spread: false })}>
              Sıkı
            </button>
            <button type="button" aria-pressed={Boolean(active.spread)} onClick={() => onChange({ ...active, spread: true })}>
              Eşit yay
            </button>
          </div>
        </div>

        <div className={styles.gapField}>
          <div className={styles.gapHead}>
            <span>Sütunlar arası genel boşluk</span>
            <strong>{active.gap ?? 16} px</strong>
          </div>
          <div className={styles.gapRow}>
            <input
              id={`${uid}-gap-range`}
              type="range"
              min={0}
              max={160}
              value={active.gap ?? 16}
              aria-label="Sütunlar arası genel boşluk"
              onChange={(e) => {
                const next = Math.max(0, Math.min(160, Number(e.target.value) || 0));
                onChange({ ...active, gap: next, columns: active.columns.map((c) => ({ ...c, gapAfter: undefined })) });
              }}
            />
            <input
              id={`${uid}-gap-num`}
              type="number"
              min={0}
              max={160}
              value={active.gap ?? 16}
              aria-label="Sütunlar arası genel boşluk (px)"
              onChange={(e) => {
                const next = Math.max(0, Math.min(160, Number(e.target.value) || 0));
                onChange({ ...active, gap: next, columns: active.columns.map((c) => ({ ...c, gapAfter: undefined })) });
              }}
            />
          </div>
          <p className={styles.smallNote}>İpucu: Önizlemede iki sütunun arasından tutup sola/sağa çekerek de boşluğu ayarlayabilirsiniz.</p>
        </div>

        <label className={styles.field} htmlFor={`${uid}-divcolor`}>
          Dikey çizgi rengi
          <div className={styles.colorPickRow}>
            <input
              id={`${uid}-divcolor`}
              type="color"
              value={active.dividerColor ?? "#bad7d2"}
              onChange={(e) => onChange({ ...active, dividerColor: e.target.value })}
            />
            <ColorSwatches value={active.dividerColor ?? "#bad7d2"} onChange={(dividerColor) => onChange({ ...active, dividerColor })} compact />
          </div>
        </label>

        <div className={styles.colTabs} role="tablist" aria-label="Sütun ayarları">
          {active.columns.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={colIndex === idx}
              className={styles.colTab}
              onClick={() => onSelectColumn(idx)}
            >
              Sütun {idx + 1}
            </button>
          ))}
        </div>

        <div className={styles.colCard}>
          <label className={styles.field} htmlFor={`${uid}-colw`}>
            Sütun {colIndex + 1} genişliği (px) <span>(boş = otomatik)</span>
            <input
              id={`${uid}-colw`}
              type="number"
              min={40}
              max={maxWidth}
              placeholder="Otomatik"
              value={col.width ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                updateCol({ width: raw ? Math.max(40, Math.min(maxWidth, Number(raw) || 40)) : undefined });
              }}
            />
          </label>
          {colIndex < active.columns.length - 1 && (
            <div className={styles.gapField}>
              <div className={styles.gapHead}>
                <span>
                  Sütun {colIndex + 1}–{colIndex + 2} arası özel boşluk
                </span>
                <strong>{col.gapAfter !== undefined ? `${col.gapAfter} px` : `Genel (${active.gap ?? 16} px)`}</strong>
              </div>
              <div className={styles.gapRow}>
                <input
                  id={`${uid}-colgap-r`}
                  type="range"
                  min={0}
                  max={160}
                  value={col.gapAfter ?? active.gap ?? 16}
                  aria-label={`Sütun ${colIndex + 1} ile ${colIndex + 2} arası boşluk`}
                  onChange={(e) => updateCol({ gapAfter: Math.max(0, Math.min(160, Number(e.target.value) || 0)) })}
                />
                <input
                  id={`${uid}-colgap-n`}
                  type="number"
                  min={0}
                  max={160}
                  placeholder={String(active.gap ?? 16)}
                  value={col.gapAfter ?? ""}
                  aria-label={`Sütun ${colIndex + 1} ile ${colIndex + 2} arası boşluk (px)`}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    updateCol({ gapAfter: raw === "" ? undefined : Math.max(0, Math.min(160, Number(raw) || 0)) });
                  }}
                />
              </div>
            </div>
          )}
          <div className={styles.inlineSetting}>
            <span>Yatay hizalama</span>
            <AlignButtons value={col.align ?? "left"} onChange={(align) => updateCol({ align })} />
          </div>
          <div className={styles.inlineSetting}>
            <span>Dikey hizalama</span>
            <VAlignButtons value={col.valign ?? "top"} onChange={(valign) => updateCol({ valign })} />
          </div>
          {colIndex > 0 && (
            <label className={styles.checkbox} htmlFor={`${uid}-coldiv`}>
              <input id={`${uid}-coldiv`} type="checkbox" checked={col.divider ?? false} onChange={(e) => updateCol({ divider: e.target.checked })} />
              Sütun {colIndex + 1} soluna dikey ayırıcı çizgi ekle
            </label>
          )}
        </div>
      </>
    );
  }

  const block = active.value;
  if (block.type === "text") {
    const field = readField(block);
    const changeStyle = (style: Partial<TextStyle>) => update({ ...block, style: { ...block.style, ...style } });
    function changeField(key: string, prefix: string, label?: string) {
      if (block.type === "text") update({ ...block, ...fieldElement(key, prefix, field?.modifier, label ?? block.label) });
    }
    return (
      <>
        <label className={styles.field} htmlFor={`${uid}-lbl`}>
          Görünecek ad <span>(paneldeki etiket)</span>
          <input
            id={`${uid}-lbl`}
            type="text"
            value={block.label ?? ""}
            maxLength={60}
            placeholder={field ? (extensionKey(field.key) ? "Örn. Türkçe Unvan" : "Otomatik") : "Örn. Şirket sloganı"}
            onChange={(e) => update({ ...block, label: e.target.value || undefined })}
          />
        </label>

        {field ? (
          <>
            {extensionKey(field.key) ? (
              <label className={styles.field} htmlFor={`${uid}-ext`}>
                Entra ID özel kutusu
                <select id={`${uid}-ext`} value={field.key} onChange={(e) => changeField(e.target.value, field.prefix)}>
                  {EXTENSION_SLOTS.map((slot) => {
                    const sample = profile[slot.key]?.trim();
                    return (
                      <option key={slot.key} value={slot.key}>
                        {slot.name}
                        {sample ? ` · ${sample}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <label className={styles.field} htmlFor={`${uid}-entra`}>
                Entra ID alanı
                <select id={`${uid}-entra`} value={field.key} onChange={(e) => changeField(e.target.value, field.prefix)}>
                  {!fields.some((item) => item.key === field.key) && <option value={field.key}>{field.key}</option>}
                  {fields
                    .filter((item) => !extensionKey(item.key))
                    .map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className={styles.field} htmlFor={`${uid}-prefix`}>
              Alanın başına metin <span>(isteğe bağlı)</span>
              <input
                id={`${uid}-prefix`}
                type="text"
                value={field.prefix}
                maxLength={70}
                placeholder="Örn. T: veya Cep:"
                onChange={(e) => changeField(field.key, e.target.value)}
              />
            </label>
            <InlineFieldAdder
              fields={fields}
              customFields={customFields}
              onAppendToken={(separator, key) => update({ ...block, text: `${block.text}${separator}{{${key}}}`, href: undefined })}
            />
            <p className={styles.smallNote}>Kişide bu bilgi boşsa satır otomatik gizlenir.</p>
          </>
        ) : (
          <>
            <label className={styles.field} htmlFor={`${uid}-txt`}>
              Metin
              <input id={`${uid}-txt`} type="text" value={block.text} maxLength={300} onChange={(e) => update({ ...block, text: e.target.value })} />
            </label>
            <InlineFieldAdder
              fields={fields}
              customFields={customFields}
              onAppendToken={(separator, key) =>
                update({ ...block, text: `${block.text}${block.text ? separator : ""}{{${key}}}` })
              }
            />
            <label className={styles.field} htmlFor={`${uid}-href`}>
              Bağlantı <span>(isteğe bağlı)</span>
              <input
                id={`${uid}-href`}
                type="url"
                value={block.href ?? ""}
                placeholder="https://"
                onChange={(e) => update({ ...block, href: e.target.value || undefined })}
              />
            </label>
          </>
        )}

        <div className={styles.inlineSetting}>
          <span>Hizalama</span>
          <AlignButtons value={block.align ?? "left"} onChange={(align) => update({ ...block, align })} />
        </div>

        <div className={styles.inspectorRow}>
          <label className={styles.field} htmlFor={`${uid}-size`}>
            Yazı boyutu (px)
            <input
              id={`${uid}-size`}
              type="number"
              min={11}
              max={20}
              value={block.style?.size ?? 13}
              onChange={(e) => changeStyle({ size: Math.max(11, Math.min(20, Number(e.target.value) || 13)) })}
            />
          </label>
          <label className={styles.field} htmlFor={`${uid}-color`}>
            Metin rengi
            <input id={`${uid}-color`} type="color" value={block.style?.color ?? "#172c3b"} onChange={(e) => changeStyle({ color: e.target.value })} />
          </label>
        </div>

        <ColorSwatches value={block.style?.color ?? "#172c3b"} onChange={(color) => changeStyle({ color })} />

        <div className={styles.checkRow}>
          <label className={styles.checkbox} htmlFor={`${uid}-bold`}>
            <input id={`${uid}-bold`} type="checkbox" checked={block.style?.bold ?? false} onChange={(e) => changeStyle({ bold: e.target.checked })} /> Kalın
          </label>
          <label className={styles.checkbox} htmlFor={`${uid}-italic`}>
            <input id={`${uid}-italic`} type="checkbox" checked={block.style?.italic ?? false} onChange={(e) => changeStyle({ italic: e.target.checked })} /> İtalik
          </label>
        </div>
      </>
    );
  }
  if (block.type === "image") {
    return <ImageInspector block={block} maxWidth={maxWidth} update={update} onUpload={onUpload} fileInputRef={imageInputRef} />;
  }
  if (block.type === "divider") {
    return (
      <>
        <label className={styles.field} htmlFor={`${uid}-div`}>
          Çizgi rengi
          <input id={`${uid}-div`} type="color" value={block.color ?? "#bad7d2"} onChange={(e) => update({ ...block, color: e.target.value })} />
        </label>
        <ColorSwatches value={block.color ?? "#bad7d2"} onChange={(color) => update({ ...block, color })} />
      </>
    );
  }
  if (block.type === "spacer") {
    return (
      <div className={styles.gapField}>
        <div className={styles.gapHead}>
          <span>Boşluk yüksekliği</span>
          <strong>{block.height} px</strong>
        </div>
        <div className={styles.gapRow}>
          <input
            id={`${uid}-sp-r`}
            type="range"
            min={1}
            max={48}
            value={block.height}
            aria-label="Boşluk yüksekliği"
            onChange={(e) => update({ ...block, height: Math.max(1, Math.min(48, Number(e.target.value) || 1)) })}
          />
          <input
            id={`${uid}-sp-n`}
            type="number"
            min={1}
            max={48}
            value={block.height}
            aria-label="Boşluk yüksekliği (px)"
            onChange={(e) => update({ ...block, height: Math.max(1, Math.min(48, Number(e.target.value) || 1)) })}
          />
        </div>
      </div>
    );
  }
  return <p className={styles.smallNote}>Bu bileşenin sırasını aşağıdaki listeden değiştirebilir veya kaldırabilirsiniz.</p>;
}

export function SignatureDesigner({ initial, sources, action, preview, fields, existingNames = [] }: SignatureDesignerProps) {
  const starting = initial?.layout ?? EMPTY_LAYOUT;
  const [history, setHistory] = useState<{ past: Node[][]; present: Node[]; future: Node[][] }>(() => ({
    past: [],
    present: toNodes(starting.elements, "start"),
    future: [],
  }));
  const { past, present: nodes, future } = history;
  const [name, setName] = useState(initial?.name ?? "");
  const normalizedName = name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
  const isDuplicateName = useMemo(
    () => Boolean(normalizedName) && existingNames.some((n) => n.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR") === normalizedName),
    [existingNames, normalizedName],
  );
  const [layoutSettings, setLayoutSettings] = useState({
    maxWidth: 800,
    fontStack: starting.fontStack || EMPTY_LAYOUT.fontStack,
    baseSize: starting.baseSize ?? 13,
    colors: {
      text: starting.colors.text || "#172c3b",
      link: starting.colors.link || "#166b63",
      divider: starting.colors.divider ?? "#bad7d2",
    },
  });
  const [paletteTab, setPaletteTab] = useState<"entra" | "custom">("entra");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedLane, setSelectedLane] = useState<Lane>(null);
  const [selectedColTab, setSelectedColTab] = useState<number>(0);
  const [outlineFilter, setOutlineFilter] = useState<Record<string, number | "all">>({});
  const [showGuides, setShowGuides] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(0);
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>(() => extractSavedCustomFields(starting.elements));
  const [dragging, setDragging] = useState(false);
  const [dropZone, setDropZone] = useState<{ key: string; side?: "before" | "after" }>();
  const [resizingGap, setResizingGap] = useState<{ rowId: string; colIndex: number } | null>(null);
  const [resizingImgId, setResizingImgId] = useState<string | null>(null);
  const [currentUploads, setCurrentUploads] = useState(0);
  const [serverMissing, setServerMissing] = useState<string[] | null>(null);
  const [form, submit, saving] = useActionState(action, { errors: [] });

  const dragItem = useRef<{ id: string } | { value: Insert } | null>(null);
  const gapDrag = useRef<{ rowId: string; colIndex: number; startX: number; startGap: number; all: boolean; snapshot: Node[] } | null>(null);
  const imgDrag = useRef<{ nodeId: string; startX: number; startW: number; ratio: number; snapshot: Node[] } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const palette = useRef<HTMLElement>(null);
  const counter = useRef(0);

  const setNodesRaw = useCallback((updater: (current: Node[]) => Node[]) => {
    setHistory((h) => ({ ...h, present: updater(h.present) }));
  }, []);

  const pushSnapshot = useCallback((snapshot: Node[]) => {
    setHistory((h) => ({ ...h, past: [...h.past.slice(-(HISTORY_LIMIT - 1)), snapshot], future: [] }));
  }, []);

  const commitNodes = useCallback((updater: (current: Node[]) => Node[]) => {
    setHistory((h) => {
      const next = updater(h.present);
      if (next === h.present) return h;
      return {
        past: [...h.past.slice(-(HISTORY_LIMIT - 1)), h.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1]!;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future.slice(0, HISTORY_LIMIT - 1)],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0]!;
      return {
        past: [...h.past.slice(-(HISTORY_LIMIT - 1)), h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const layout = useMemo<Layout>(
    () => ({
      version: 1,
      fontStack: layoutSettings.fontStack,
      baseSize: layoutSettings.baseSize,
      maxWidth: layoutSettings.maxWidth,
      colors: { ...starting.colors, ...layoutSettings.colors },
      elements: toElements(nodes),
    }),
    [starting.colors, layoutSettings, nodes],
  );

  const canvasWidth = layout.maxWidth ?? 800;
  const profile = sources[source]?.values ?? {};
  const selected = selectedId ? locate(nodes, selectedId) : undefined;
  const moveOptions = useMemo(
    () => [{ lane: null, index: nodes.length, key: "root", label: "Ana satır (tam genişlik)" }, ...columnLanes(nodes)],
    [nodes],
  );

  const fieldGroups = useMemo(() => {
    const groups = new Map<string, Field[]>();
    const search = normalizeSearch(query.trim());
    for (const field of fields) {
      if (extensionKey(field.key)) continue;
      if (search && !normalizeSearch(`${field.label} ${field.key} ${field.group}`).includes(search)) continue;
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups];
  }, [fields, query]);

  const customLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of customFields) {
      if (item.source === "entra" && item.entraKey) map[item.entraKey] = item.label;
    }
    const walk = (list: Node[]) => {
      for (const node of list) {
        if ("value" in node && node.value.type === "text" && node.value.label) {
          const field = readField(node.value);
          if (field) map[field.key] = node.value.label;
        } else if ("columns" in node) {
          for (const col of node.columns) walk(col.nodes);
        }
      }
    };
    walk(nodes);
    return map;
  }, [customFields, nodes]);

  const missingFields = useMemo(() => {
    if (nodes.length === 0) return [];
    return serverMissing ?? computeMissing(layout.elements, profile);
  }, [layout.elements, nodes.length, profile, serverMissing]);

  useEffect(() => {
    if (layout.elements.length === 0) {
      setServerMissing([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void preview({ ...layout, elements: visiblePreviewElements(layout.elements) }, profile)
        .then((result) => {
          if (current) setServerMissing(result.missing);
        })
        .catch(() => {
          if (current) setServerMissing(null);
        });
    }, 220);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [layout, preview, profile]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editingInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" && !editingInput) {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
        if (key === "y" && !editingInput) {
          event.preventDefault();
          redo();
          return;
        }
      }
      if (event.key === "Escape") {
        setSelectedId(undefined);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !editingInput && selectedId) {
        const hit = locate(nodes, selectedId);
        if (hit) {
          event.preventDefault();
          removeNode(hit.node, hit.lane);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nodes, redo, selectedId, undo]);

  function select(node: Node, lane: Lane, columnIndex?: number) {
    setSelectedId(node.id);
    setSelectedLane(lane);
    if (columnIndex !== undefined) setSelectedColTab(columnIndex);
  }

  function append(value: Insert, zone?: Zone) {
    const lane = zone ? (value.type === "columns" ? null : zone.lane) : value.type === "columns" ? null : selectedLane;
    counter.current++;
    const node = toNodes([value], `added-${counter.current}`)[0]!;
    commitNodes((current) => inLane(current, lane, (part) => insertAt(part, zone?.index ?? part.length, node)));
    if ("columns" in node) {
      select(node, { owner: node.id, column: 0 }, 0);
    } else {
      select(node, lane);
    }
  }

  function applyStarter(elements: Layout["elements"]) {
    counter.current++;
    const fresh = toNodes(elements, `preset-${counter.current}`);
    commitNodes(() => fresh);
    const first = fresh[0];
    if (first && "columns" in first) {
      select(first, { owner: first.id, column: 0 }, 0);
    } else if (first) {
      select(first, null);
    } else {
      setSelectedId(undefined);
      setSelectedLane(null);
    }
  }

  function move(id: string, zone: Zone) {
    const from = locate(nodes, id);
    if (!from || (zone.lane && "columns" in from.node)) return;
    const sameLane = from.lane?.owner === zone.lane?.owner && from.lane?.column === zone.lane?.column;
    const index = zone.index - (sameLane && from.index < zone.index ? 1 : 0);
    if (sameLane && index === from.index) return;
    commitNodes((current) => {
      const removed = inLane(current, from.lane, (part) => part.filter((node) => node.id !== id));
      return inLane(removed, zone.lane, (part) => insertAt(part, index, from.node));
    });
    select(from.node, zone.lane);
  }

  function duplicateNode(node: Node, lane: Lane, index: number) {
    counter.current++;
    const copy = cloneNodeWithPrefix(node, `dup-${counter.current}`);
    commitNodes((current) => inLane(current, lane, (part) => insertAt(part, index + 1, copy)));
    select(copy, lane, "columns" in copy ? 0 : undefined);
  }

  function removeNode(node: Node, lane: Lane) {
    commitNodes((current) => inLane(current, lane, (part) => part.filter((item) => item.id !== node.id)));
    if (selectedId === node.id || (selectedId && locate([node], selectedId))) {
      setSelectedId(undefined);
      setSelectedLane(lane);
    }
  }

  function updateNode(next: Node) {
    commitNodes((current) => {
      const position = locate(current, next.id);
      return position ? inLane(current, position.lane, (part) => part.map((node) => (node.id === next.id ? next : node))) : current;
    });
  }

  function moveHorizontalColumn(node: Node, lane: NonNullable<Lane>, delta: -1 | 1) {
    const owner = locate(nodes, lane.owner);
    if (!owner || !("columns" in owner.node)) return;
    const nextCol = lane.column + delta;
    if (nextCol < 0 || nextCol >= owner.node.columns.length) return;
    const targetLane = { owner: lane.owner, column: nextCol };
    move(node.id, { lane: targetLane, index: owner.node.columns[nextCol]!.nodes.length });
  }

  function insertCustomField(item: CustomFieldItem) {
    if (item.source === "entra" && item.entraKey) {
      append(fieldElement(item.entraKey, "", undefined, item.label));
    } else {
      append({
        type: "text",
        text: item.value ?? item.label,
        label: item.label,
        href: item.href,
      });
    }
  }

  function dragStart(event: DragEvent, spec: NonNullable<typeof dragItem.current>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "id" in spec ? "move" : "copy";
    event.dataTransfer.setData("text/plain", "Sigwide");
    dragItem.current = spec;
    setDragging(true);
  }

  function dragEnd() {
    dragItem.current = null;
    setDragging(false);
    setDropZone(undefined);
  }

  function drop(event: DragEvent, zone: Zone) {
    if (!dragItem.current) return;
    event.preventDefault();
    event.stopPropagation();
    const spec = dragItem.current;
    if ("id" in spec) move(spec.id, zone);
    else append(spec.value, zone);
    dragEnd();
  }

  function canDropInLane(lane: Lane): boolean {
    const item = dragItem.current;
    if (!item) return false;
    if (!lane) return true;
    if ("value" in item) return item.value.type !== "columns";
    const hit = locate(nodes, item.id);
    return !(hit && "columns" in hit.node);
  }

  function dropTarget(lane: Lane, index: number, splitHalf = false) {
    const baseKey = `${laneKey(lane)}/${index}`;
    const isOver = dropZone?.key === baseKey;
    return {
      "data-over": isOver ? (dropZone?.side ?? "before") : undefined,
      onDragOver: (event: DragEvent) => {
        if (!canDropInLane(lane)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = dragItem.current && "id" in dragItem.current ? "move" : "copy";
        let side: "before" | "after" = "before";
        if (splitHalf) {
          const rect = event.currentTarget.getBoundingClientRect();
          side = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
        }
        setDropZone({ key: baseKey, side });
      },
      onDrop: (event: DragEvent) => {
        const offset = splitHalf && dropZone?.key === baseKey && dropZone.side === "after" ? 1 : 0;
        drop(event, { lane, index: index + offset });
      },
    };
  }

  function startGapResize(
    event: ReactPointerEvent<HTMLDivElement>,
    rowNode: Extract<Node, { columns: ColumnNode[] }>,
    colIndex: number,
    currentGap: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const all = event.shiftKey;
    gapDrag.current = { rowId: rowNode.id, colIndex, startX: event.clientX, startGap: currentGap, all, snapshot: nodes };
    setResizingGap({ rowId: rowNode.id, colIndex });
    select(rowNode, { owner: rowNode.id, column: colIndex }, colIndex);
  }

  function moveGapResize(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gapDrag.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const next = Math.max(0, Math.min(160, Math.round(active.startGap + (event.clientX - active.startX))));
    setNodesRaw((current) =>
      current.map((item) => {
        if (item.id !== active.rowId || !("columns" in item)) return item;
        if (active.all) {
          return { ...item, gap: next, columns: item.columns.map((col) => ({ ...col, gapAfter: undefined })) };
        }
        return {
          ...item,
          columns: item.columns.map((col, idx) => (idx === active.colIndex ? { ...col, gapAfter: next } : col)),
        };
      }),
    );
  }

  function endGapResize(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gapDrag.current;
    if (!active) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pushSnapshot(active.snapshot);
    gapDrag.current = null;
    setResizingGap(null);
  }

  function startImageResize(event: ReactPointerEvent<HTMLDivElement>, node: Extract<Node, { value: Leaf }>) {
    if (node.value.type !== "image") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const ratio = node.value.height > 0 ? node.value.width / node.value.height : 1;
    imgDrag.current = { nodeId: node.id, startX: event.clientX, startW: node.value.width, ratio, snapshot: nodes };
    setResizingImgId(node.id);
  }

  function moveImageResize(event: ReactPointerEvent<HTMLDivElement>) {
    const active = imgDrag.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const nextW = Math.max(24, Math.min(canvasWidth, Math.round(active.startW + (event.clientX - active.startX))));
    const nextH = Math.max(16, Math.min(600, Math.round(nextW / active.ratio)));
    setNodesRaw((current) => {
      const hit = locate(current, active.nodeId);
      if (!hit || !("value" in hit.node) || hit.node.value.type !== "image") return current;
      const updated: Node = { id: hit.node.id, value: { ...hit.node.value, width: nextW, height: nextH } };
      return inLane(current, hit.lane, (part) => part.map((item) => (item.id === updated.id ? updated : item)));
    });
  }

  function endImageResize(event: ReactPointerEvent<HTMLDivElement>) {
    const active = imgDrag.current;
    if (!active) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pushSnapshot(active.snapshot);
    imgDrag.current = null;
    setResizingImgId(null);
  }

  function renderPreviewLeaf(node: Extract<Node, { value: Leaf }>, lane: Lane, index: number, defaultAlign?: Align): ReactNode {
    const label = blockLabel(node, fields);
    const isSelected = selectedId === node.id;
    return (
      <div
        key={node.id}
        className={styles.liveItem}
        data-selected={isSelected}
        draggable={resizingImgId !== node.id}
        onDragStart={(event) => dragStart(event, { id: node.id })}
        onDragEnd={dragEnd}
        onClick={(event) => {
          event.stopPropagation();
          select(node, lane);
        }}
        title="Seçmek için tıklayın, taşımak için sürükleyin"
        {...dropTarget(lane, index, true)}
      >
        <LiveElementView
          block={node.value}
          values={profile}
          layout={layout}
          label={label}
          defaultAlign={defaultAlign}
          isSelected={isSelected}
          resizingImage={resizingImgId === node.id}
          onStartImageResize={node.value.type === "image" ? (e) => startImageResize(e, node) : undefined}
          onMoveImageResize={moveImageResize}
          onEndImageResize={endImageResize}
        />
      </div>
    );
  }

  function renderPreviewRow(node: Node, index: number): ReactNode {
    if ("value" in node) {
      return renderPreviewLeaf(node, null, index);
    }
    const gap = Math.max(0, Math.min(160, node.gap ?? 16));
    const divColor = node.dividerColor ?? layout.colors.divider ?? "#bad7d2";
    const rowSelected = selectedId === node.id;

    return (
      <div
        key={node.id}
        className={styles.liveColumnsRow}
        data-selected={rowSelected}
        data-guides={showGuides || dragging}
        onClick={(event) => {
          event.stopPropagation();
          select(node, { owner: node.id, column: 0 }, 0);
        }}
        {...dropTarget(null, index, true)}
      >
        <div className={styles.liveColumnsTable} data-spread={Boolean(node.spread)}>
          {node.columns.map((column, position) => {
            const lane: Lane = { owner: node.id, column: position };
            const isTargetLane = selectedLane?.owner === node.id && selectedLane.column === position;
            const colGap = Math.max(0, Math.min(160, column.gapAfter ?? gap));
            const rightDivider = position < node.columns.length - 1 && Boolean(node.columns[position + 1]?.divider);
            const isResizingThis = resizingGap?.rowId === node.id && resizingGap.colIndex === position;
            const justifyContent =
              column.valign === "middle" ? "center" : column.valign === "bottom" ? "flex-end" : "flex-start";
            const cellStyle: React.CSSProperties = {
              width: column.width ? `${column.width}px` : undefined,
              flex: column.width ? `0 0 ${column.width}px` : undefined,
              justifyContent,
              textAlign: column.align ?? "left",
            };

            return (
              <Fragment key={position}>
                <div
                  className={styles.liveColumnCell}
                  data-empty={column.nodes.length === 0}
                  data-target={isTargetLane}
                  data-guides={showGuides || dragging}
                  style={cellStyle}
                  onClick={(event) => {
                    event.stopPropagation();
                    select(node, lane, position);
                  }}
                  {...dropTarget(lane, column.nodes.length)}
                >
                  {column.nodes.map((child, childIdx) =>
                    "value" in child ? renderPreviewLeaf(child, lane, childIdx, column.align) : null,
                  )}
                  {(column.nodes.length === 0 || dragging) && (
                    <div className={styles.liveDropHint} {...dropTarget(lane, column.nodes.length)}>
                      {column.nodes.length === 0 ? `Sütun ${position + 1}` : "+ Buraya bırak"}
                    </div>
                  )}
                </div>

                {position < node.columns.length - 1 && (
                  <div
                    className={styles.liveGapCell}
                    style={{ width: colGap, minWidth: colGap }}
                    data-active={isResizingThis}
                    data-guides={showGuides}
                    onClick={(event) => {
                      event.stopPropagation();
                      select(node, lane, position);
                    }}
                  >
                    {rightDivider && <span className={styles.liveGapDivider} style={{ backgroundColor: divColor }} />}
                    <div
                      className={styles.liveGapHandle}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Sütun ${position + 1} ile ${position + 2} arası boşluk: ${colGap} piksel`}
                      title="Boşluğu ayarlamak için sola/sağa çekin (Shift: tüm sütunlar · çift tık: 16 px)"
                      draggable={false}
                      onPointerDown={(event) => startGapResize(event, node, position, colGap)}
                      onPointerMove={moveGapResize}
                      onPointerUp={endGapResize}
                      onPointerCancel={endGapResize}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        updateNode({
                          ...node,
                          columns: node.columns.map((c, idx) => (idx === position ? { ...c, gapAfter: 16 } : c)),
                        });
                      }}
                    >
                      <span className={styles.liveGapBar} />
                      <span className={styles.liveGapBadge}>{colGap} px</span>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function renderQuickAlignBar(): ReactNode {
    if (!selected) return null;
    const node = selected.node;
    const label = blockLabel(node, fields);
    const ownerColumns =
      "columns" in node
        ? node
        : selected.lane
          ? (() => {
              const hit = locate(nodes, selected.lane.owner);
              return hit && "columns" in hit.node ? hit.node : undefined;
            })()
          : undefined;

    const applyUniformGap = (row: Extract<Node, { columns: ColumnNode[] }>, next: number) => {
      const clamped = Math.max(0, Math.min(160, Math.round(next)));
      updateNode({
        ...row,
        gap: clamped,
        columns: row.columns.map((col) => ({ ...col, gapAfter: undefined })),
      });
    };

    const gapControl = ownerColumns ? (
      <div className={styles.quickGapGroup}>
        <div className={styles.segmented} role="group" aria-label="Sütun yerleşimi">
          <button
            type="button"
            title="Sütunları içeriğe göre yan yana yerleştir"
            aria-pressed={!ownerColumns.spread}
            onClick={() => updateNode({ ...ownerColumns, spread: false })}
          >
            Sıkı
          </button>
          <button
            type="button"
            title="Sütunları satır genişliğine yay"
            aria-pressed={Boolean(ownerColumns.spread)}
            onClick={() => updateNode({ ...ownerColumns, spread: true })}
          >
            Eşit yay
          </button>
        </div>
        <div className={styles.quickGap} title="Tüm sütunlar arası boşluk (tek bir boşluk için önizlemede aradan tutup çekin)">
          <span>Boşluk</span>
          <div className={styles.gapPresets} role="group" aria-label="Hazır boşluk değerleri">
            {GAP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={
                  (ownerColumns.gap ?? 16) === preset &&
                  ownerColumns.columns.every((col) => col.gapAfter === undefined)
                }
                onClick={() => applyUniformGap(ownerColumns, preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            max={160}
            value={ownerColumns.gap ?? 16}
            aria-label="Sütun boşluğu (px)"
            onChange={(e) => applyUniformGap(ownerColumns, Number(e.target.value) || 0)}
          />
          <small>px</small>
        </div>
      </div>
    ) : null;

    if ("columns" in node) {
      const colIdx = Math.min(selectedColTab, node.columns.length - 1);
      const col = node.columns[colIdx]!;
      const updateCol = (patch: Partial<ColumnNode>) =>
        updateNode({
          ...node,
          columns: node.columns.map((item, idx) => (idx === colIdx ? { ...item, ...patch } : item)),
        });

      return (
        <div className={styles.alignBar} aria-label="Hızlı sütun biçimlendirme">
          <span className={styles.alignTag}>
            {label} · Sütun {colIdx + 1}
          </span>
          <div className={styles.alignControls}>
            <div className={styles.segmented} role="group" aria-label="Sütun sayısı">
              {COLUMN_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  title={`${count} sütun`}
                  aria-pressed={node.columns.length === count}
                  onClick={() => updateNode(resizeColumns(node, count))}
                >
                  {count}s
                </button>
              ))}
            </div>
            {gapControl}
            <AlignButtons value={col.align ?? "left"} onChange={(align) => updateCol({ align })} />
            <VAlignButtons value={col.valign ?? "top"} onChange={(valign) => updateCol({ valign })} />
            {colIdx > 0 && (
              <button
                type="button"
                className={styles.miniToggle}
                aria-pressed={Boolean(col.divider)}
                onClick={() => updateCol({ divider: !col.divider })}
                title="Bu sütunun soluna dikey ayırıcı çizgi ekle/kaldır"
              >
                | Çizgi
              </button>
            )}
          </div>
        </div>
      );
    }

    const leaf = node.value;
    if (leaf.type === "text") {
      const size = leaf.style?.size ?? layout.baseSize ?? 13;
      const color = leaf.style?.color ?? (leaf.href ? layout.colors.link : layout.colors.text);
      const patchStyle = (style: Partial<TextStyle>) => updateNode({ id: node.id, value: { ...leaf, style: { ...leaf.style, ...style } } });
      return (
        <div className={styles.alignBar} aria-label="Hızlı metin biçimlendirme">
          <span className={styles.alignTag}>{label}</span>
          <div className={styles.alignControls}>
            <div className={styles.segmented} role="group" aria-label="Yazı stili">
              <button type="button" title="Kalın" aria-pressed={Boolean(leaf.style?.bold)} onClick={() => patchStyle({ bold: !leaf.style?.bold })}>
                <Bold size={13} />
              </button>
              <button type="button" title="İtalik" aria-pressed={Boolean(leaf.style?.italic)} onClick={() => patchStyle({ italic: !leaf.style?.italic })}>
                <Italic size={13} />
              </button>
            </div>
            <div className={styles.segmented} role="group" aria-label="Yazı boyutu">
              <button type="button" title="Yazıyı küçült" disabled={size <= 11} onClick={() => patchStyle({ size: Math.max(11, size - 1) })}>
                −
              </button>
              <span className={styles.sizeReadout}>{size}px</span>
              <button type="button" title="Yazıyı büyüt" disabled={size >= 20} onClick={() => patchStyle({ size: Math.min(20, size + 1) })}>
                +
              </button>
            </div>
            <ColorSwatches value={color} onChange={(c) => patchStyle({ color: c })} compact />
            <AlignButtons value={leaf.align ?? "left"} onChange={(align) => updateNode({ id: node.id, value: { ...leaf, align } })} />
            {gapControl}
          </div>
        </div>
      );
    }

    if (leaf.type === "image") {
      const ratio = leaf.height > 0 ? leaf.width / leaf.height : 1;
      const stepSize = (delta: number) => {
        const nextW = Math.max(24, Math.min(canvasWidth, leaf.width + delta));
        const nextH = Math.max(16, Math.min(600, Math.round(nextW / ratio)));
        updateNode({ id: node.id, value: { ...leaf, width: nextW, height: nextH } });
      };
      return (
        <div className={styles.alignBar} aria-label="Hızlı görsel ayarları">
          <span className={styles.alignTag}>
            {label} · {leaf.width}×{leaf.height}
          </span>
          <div className={styles.alignControls}>
            <button type="button" className={styles.miniToggle} onClick={() => imageInputRef.current?.click()}>
              <Upload size={13} /> {leaf.src ? "Görsel değiştir" : "Görsel yükle"}
            </button>
            <div className={styles.segmented} role="group" aria-label="Görsel boyutu">
              <button type="button" title="Küçült" onClick={() => stepSize(-16)}>
                −
              </button>
              <button type="button" title="Büyüt" onClick={() => stepSize(16)}>
                +
              </button>
            </div>
            <AlignButtons value={leaf.align ?? "left"} onChange={(align) => updateNode({ id: node.id, value: { ...leaf, align } })} />
            {gapControl}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.alignBar}>
        <span className={styles.alignTag}>{label}</span>
        {gapControl && <div className={styles.alignControls}>{gapControl}</div>}
      </div>
    );
  }

  function renderOutlineList(list: Node[], lane: Lane, totalCols?: number): ReactNode {
    const focused = selectedLane?.owner === lane?.owner && selectedLane?.column === lane?.column;
    return (
      <div className={styles.outlineLane}>
        {list.map((node, index) => {
          const label = blockLabel(node, fields);
          const snippet = blockSnippet(node, profile);
          const isSelected = selectedId === node.id;
          const activeFilter = outlineFilter[node.id] ?? "all";
          return (
            <div key={node.id} className={styles.outlineNode}>
              <div className={styles.outlineRow} data-selected={isSelected} {...dropTarget(lane, index)}>
                <span
                  className={styles.grip}
                  draggable
                  onDragStart={(event) => dragStart(event, { id: node.id })}
                  onDragEnd={dragEnd}
                  title="Sıralamak için sürükleyin"
                >
                  <GripVertical size={14} />
                </span>
                <button
                  type="button"
                  className={styles.outlineSelect}
                  onClick={() => select(node, lane, "columns" in node ? 0 : undefined)}
                >
                  <span className={styles.outlineName}>{label}</span>
                  {snippet && snippet !== label && <span className={styles.outlineSnippet}>{snippet}</span>}
                  {"value" in node && node.value.type === "text" && readField(node.value) && (
                    <span className={styles.outlineMeta} title={readField(node.value)!.key}>
                      {extensionKey(readField(node.value)!.key) ? extensionShort(readField(node.value)!.key) : "Entra"}
                    </span>
                  )}
                </button>
                <div className={styles.outlineActions}>
                  {"columns" in node && (
                    <div className={styles.miniCounts} role="group" aria-label="Sütun sayısı">
                      {COLUMN_COUNTS.map((count) => (
                        <button
                          key={count}
                          type="button"
                          aria-pressed={node.columns.length === count}
                          title={`${count} sütun`}
                          onClick={() => updateNode(resizeColumns(node, count))}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  )}
                  {lane && totalCols && totalCols > 1 && (
                    <>
                      <button
                        type="button"
                        title="Soldaki sütuna taşı"
                        aria-label={`${label} soldaki sütuna taşı`}
                        disabled={lane.column === 0}
                        onClick={() => moveHorizontalColumn(node, lane, -1)}
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        type="button"
                        title="Sağdaki sütuna taşı"
                        aria-label={`${label} sağdaki sütuna taşı`}
                        disabled={lane.column === totalCols - 1}
                        onClick={() => moveHorizontalColumn(node, lane, 1)}
                      >
                        <ArrowRight size={13} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    title="Yukarı taşı"
                    aria-label={`${label} yukarı taşı`}
                    disabled={index === 0}
                    onClick={() => move(node.id, { lane, index: index - 1 })}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    title="Aşağı taşı"
                    aria-label={`${label} aşağı taşı`}
                    disabled={index === list.length - 1}
                    onClick={() => move(node.id, { lane, index: index + 2 })}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    title="Çoğalt"
                    aria-label={`${label} çoğalt`}
                    onClick={() => duplicateNode(node, lane, index)}
                  >
                    <Copy size={13} />
                  </button>
                  <button type="button" title="Kaldır" aria-label={`${label} kaldır`} onClick={() => removeNode(node, lane)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {"columns" in node && (
                <div className={styles.outlineColumnsWrap}>
                  <div className={styles.outlineColFilter} role="tablist" aria-label="Sütun filtresi">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeFilter === "all"}
                      onClick={() => setOutlineFilter((prev) => ({ ...prev, [node.id]: "all" }))}
                    >
                      Tümü ({node.columns.length})
                    </button>
                    {node.columns.map((column, colIdx) => (
                      <button
                        key={colIdx}
                        type="button"
                        role="tab"
                        aria-selected={activeFilter === colIdx}
                        onClick={() => {
                          setOutlineFilter((prev) => ({ ...prev, [node.id]: colIdx }));
                          setSelectedLane({ owner: node.id, column: colIdx });
                          setSelectedId(node.id);
                          setSelectedColTab(colIdx);
                        }}
                      >
                        S{colIdx + 1}
                        {column.nodes.length > 0 ? ` (${column.nodes.length})` : ""}
                      </button>
                    ))}
                  </div>
                  <div className={styles.outlineColumns}>
                    {node.columns.map((column, colIdx) => {
                      if (activeFilter !== "all" && activeFilter !== colIdx) return null;
                      const colLane: Lane = { owner: node.id, column: colIdx };
                      const activeTarget = selectedLane?.owner === node.id && selectedLane.column === colIdx;
                      return (
                        <div key={colIdx} className={styles.outlineColBox} data-active={activeTarget}>
                          <div className={styles.outlineColHead}>
                            <button type="button" className={styles.outlineColBtn} onClick={() => select(node, colLane, colIdx)}>
                              Sütun {colIdx + 1}
                              {column.width ? ` · ${column.width} px` : ""}
                            </button>
                            <button
                              type="button"
                              className={styles.outlineTargetBtn}
                              data-active={activeTarget}
                              onClick={() => {
                                setSelectedLane(colLane);
                                setSelectedId(node.id);
                                setSelectedColTab(colIdx);
                              }}
                            >
                              {activeTarget ? "Aktif hedef" : "+ Buraya ekle"}
                            </button>
                          </div>
                          {renderOutlineList(column.nodes, colLane, node.columns.length)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {list.length === 0 && (
          <button
            type="button"
            className={styles.outlineEmpty}
            data-active={focused}
            {...dropTarget(lane, 0)}
            onClick={() => {
              setSelectedLane(lane);
              if (!lane) setSelectedId(undefined);
              palette.current?.querySelector("button")?.focus();
            }}
          >
            <Plus size={13} /> {lane ? "Boş sütun — soldan bileşen seçin veya sürükleyin" : "Henüz bileşen eklenmedi"}
          </button>
        )}
      </div>
    );
  }

  const activeTargetLabel = selectedLane
    ? moveOptions.find((opt) => opt.key === laneKey(selectedLane))?.label ?? "Sütun"
    : null;

  return (
    <form className={styles.designer} action={submit}>
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="version" value={initial.version} />
        </>
      )}
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />

      <div className={styles.templateBar}>
        <label className={styles.field} htmlFor="sigwide-template-name">
          Şablon adı
          <input
            id="sigwide-template-name"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Genel şirket imzası"
            required
            maxLength={100}
          />
        </label>
        <div className={styles.barActions}>
          <div className={styles.segmented} role="group" aria-label="Geçmiş işlemleri">
            <button type="button" title="Geri al (Ctrl+Z)" aria-label="Geri al" disabled={past.length === 0} onClick={undo}>
              <Undo2 size={15} />
            </button>
            <button type="button" title="İleri al (Ctrl+Y)" aria-label="İleri al" disabled={future.length === 0} onClick={redo}>
              <Redo2 size={15} />
            </button>
          </div>
          {nodes.length > 0 && (
            <button
              type="button"
              className={styles.secondaryBtn}
              title="Tuvali temizle (Ctrl+Z ile geri alınabilir)"
              onClick={() => {
                commitNodes(() => []);
                setSelectedId(undefined);
                setSelectedLane(null);
              }}
            >
              <RotateCcw size={14} /> Temizle
            </button>
          )}
          <button type="submit" disabled={saving || currentUploads > 0 || isDuplicateName} className={styles.primary}>
            <Save size={16} aria-hidden="true" />{" "}
            {saving ? "Kaydediliyor…" : initial?.status === "published" ? "Değişiklikleri kaydet" : "Taslağı kaydet"}
          </button>
        </div>
        {isDuplicateName && (
          <p role="alert" className={styles.nameError}>
            Bu isimde bir imza şablonu zaten var. Lütfen farklı bir ad yazın.
          </p>
        )}
        {initial?.status === "published" && (
          <p className={styles.publishedNote}>Bu imza yayında. Kaydedilen tasarım sonraki iletilerde kullanılır.</p>
        )}
      </div>

      {form.errors.length > 0 && (
        <div role="alert" className={styles.errors}>
          <ul>
            {form.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.palette} ref={palette} aria-label="İmza bileşenleri">
          <div className={styles.paletteSection}>
            <h2>Bileşenler</h2>
            <div className={styles.inserts}>
              {INSERTS.map(({ label, value, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => append(value)}
                  draggable
                  onDragStart={(event) => dragStart(event, { value })}
                  onDragEnd={dragEnd}
                  className={styles.insert}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.columnPalette}>
            <h3>
              <Columns2 size={13} /> Çoklu sütun satırı ekle
            </h3>
            <div className={styles.columnBtns}>
              {COLUMN_COUNTS.map((count) => {
                const value = makeColumns(count);
                return (
                  <button
                    key={count}
                    type="button"
                    className={styles.columnBtn}
                    draggable
                    onDragStart={(event) => dragStart(event, { value })}
                    onDragEnd={dragEnd}
                    onClick={() => append(value)}
                    title={`${count} sütunlu yatay satır ekle`}
                  >
                    <strong>{count}</strong>
                    <span>sütun</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.directory}>
            <div className={styles.paletteTabs} role="tablist" aria-label="Alan kategorileri">
              <button
                type="button"
                role="tab"
                aria-selected={paletteTab === "entra"}
                onClick={() => setPaletteTab("entra")}
              >
                Entra alanları
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paletteTab === "custom"}
                onClick={() => setPaletteTab("custom")}
              >
                Özel alanlar {customFields.length > 0 ? `(${customFields.length})` : ""}
              </button>
            </div>

            {paletteTab === "entra" ? (
              <>
                <label className={styles.search} htmlFor="sigwide-field-search">
                  <Search size={15} />
                  <input
                    id="sigwide-field-search"
                    type="search"
                    aria-label="Entra ID alanı ara"
                    placeholder="Alan ara…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className={styles.directoryItems}>
                  {fieldGroups.map(([group, items]) => (
                    <div key={group}>
                      <h3>{group}</h3>
                      {items.map((field) => {
                        const value = fieldElement(field.key);
                        return (
                          <button
                            type="button"
                            key={field.key}
                            className={styles.directoryField}
                            draggable
                            onDragStart={(event) => dragStart(event, { value })}
                            onDragEnd={dragEnd}
                            onClick={() => append(value)}
                          >
                            <span>{field.label}</span>
                            <Plus size={14} />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {fieldGroups.length === 0 && <p className={styles.smallNote}>Eşleşen alan bulunamadı.</p>}
                </div>
              </>
            ) : (
              <div className={styles.customTabBody}>
                {customFields.length > 0 && (
                  <div className={styles.savedCustoms}>
                    <h3>
                      <Tag size={12} /> Özel alanlarım
                    </h3>
                    {customFields.map((item) => {
                      const insertValue: Insert =
                        item.source === "entra" && item.entraKey
                          ? fieldElement(item.entraKey, "", undefined, item.label)
                          : { type: "text", text: item.value ?? item.label, label: item.label, href: item.href };
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.directoryField}
                          draggable
                          onDragStart={(event) => dragStart(event, { value: insertValue })}
                          onDragEnd={dragEnd}
                          onClick={() => insertCustomField(item)}
                        >
                          <span className={styles.customFieldTitle}>
                            {item.label}
                            <small>{item.source === "entra" ? extensionShort(item.entraKey ?? "") : "Sabit"}</small>
                          </span>
                          <Plus size={14} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <CustomFieldCreator
                  profile={profile}
                  onCreate={(item) => {
                    setCustomFields((prev) => [...prev, item]);
                    insertCustomField(item);
                  }}
                />
              </div>
            )}
          </div>
        </aside>

        <div className={styles.workSurface}>
          <section className={styles.preview} aria-label="Canlı imza önizlemesi">
            <div className={styles.previewHeader}>
              <div>
                <h2>Canlı önizleme</h2>
                <p className={styles.previewSub}>
                  Öğeleri sürükleyip hizalayın; iki sütunun arasından tutup çekerek boşluğu, görselin köşesinden boyutunu ayarlayın.
                </p>
              </div>
              <div className={styles.previewTools}>
                {sources.length > 0 && (
                  <label className={styles.sample} htmlFor="sigwide-preview-person">
                    <UserRound size={15} />
                    <select
                      id="sigwide-preview-person"
                      aria-label="Önizleme kişisi"
                      value={source}
                      onChange={(e) => setSource(Number(e.target.value))}
                    >
                      {sources.map((item, index) => (
                        <option key={index} value={index}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className={styles.guideToggle}
                  aria-pressed={showGuides}
                  onClick={() => setShowGuides((value) => !value)}
                  title="Sütun kılavuz çizgilerini göster/gizle"
                >
                  <Eye size={14} /> Kılavuz
                </button>
              </div>
            </div>

            {activeTargetLabel && (
              <div className={styles.targetBanner}>
                <span>
                  Soldan tıklanan bileşenler şuraya eklenir: <strong>{activeTargetLabel}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLane(null);
                    setSelectedId(undefined);
                  }}
                >
                  Ana alana dön
                </button>
              </div>
            )}

            {renderQuickAlignBar()}

            <div className={styles.previewScroll}>
              <div
                className={styles.emailSheet}
                data-empty={nodes.length === 0}
                data-dragging={dragging}
                onClick={() => {
                  setSelectedId(undefined);
                  setSelectedLane(null);
                }}
                {...dropTarget(null, nodes.length)}
              >
                <div className={styles.emailSheetInner}>
                  {nodes.length === 0 ? (
                    <div className={styles.emptyCanvas}>
                      <p>İmzanız burada gerçek orantısıyla canlı görünür.</p>
                      <span>Soldan bileşen veya 2–5 sütunlu satır sürükleyin ya da 1 tıkla hazır iskeletle başlayın:</span>
                      <div className={styles.starterGrid}>
                        {STARTER_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={styles.starterCard}
                            onClick={(e) => {
                              e.stopPropagation();
                              applyStarter(preset.elements);
                            }}
                          >
                            <div className={styles.starterMini} data-cols={preset.cols}>
                              {Array.from({ length: preset.cols }, (_, i) => (
                                <span key={i} />
                              ))}
                            </div>
                            <strong>
                              <Sparkles size={12} /> {preset.title}
                            </strong>
                            <small>{preset.subtitle}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {nodes.map((node, index) => renderPreviewRow(node, index))}
                      {dragging && (
                        <div className={styles.rootDropEnd} {...dropTarget(null, nodes.length)}>
                          + Alt satır olarak bırak
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {missingFields.length > 0 && (
              <p className={styles.missing}>
                Seçili kişide boş olduğu için gizlenen alanlar:{" "}
                {missingFields
                  .map(
                    (key) =>
                      customLabelMap[key] ??
                      (extensionKey(key) ? extensionName(key) : fields.find((field) => field.key === key)?.label ?? key),
                  )
                  .join(", ")}
              </p>
            )}
          </section>

          <section className={styles.outlinePanel} aria-label="Sıralama ve satır düzeni">
            <div className={styles.panelHead}>
              <h2>
                <Layers size={16} /> Sıralama ve düzen
              </h2>
              {selectedLane && (
                <button
                  type="button"
                  className={styles.resetTarget}
                  onClick={() => {
                    setSelectedLane(null);
                    setSelectedId(undefined);
                  }}
                >
                  Ana alana dön
                </button>
              )}
            </div>
            {renderOutlineList(nodes, null)}
          </section>
        </div>

        <aside className={styles.inspectorPanel} aria-label="Bileşen ayarları">
          <div className={styles.panelHead}>
            <h2>
              <SlidersHorizontal size={16} /> {selected ? blockLabel(selected.node, fields) : "Genel imza ayarları"}
            </h2>
            {selected && (
              <button type="button" className={styles.resetTarget} onClick={() => setSelectedId(undefined)}>
                Genel ayarlar
              </button>
            )}
          </div>

          {selected ? (
            <div className={styles.inspectorBody}>
              <Inspector
                key={selected.node.id}
                active={selected.node}
                selectedColumn={selectedColTab}
                fields={fields}
                customFields={customFields}
                profile={profile}
                maxWidth={canvasWidth}
                imageInputRef={imageInputRef}
                onSelectColumn={(colIdx) => {
                  setSelectedColTab(colIdx);
                  if ("columns" in selected.node) {
                    setSelectedLane({ owner: selected.node.id, column: colIdx });
                  }
                }}
                onUpload={(active) => setCurrentUploads((count) => count + (active ? 1 : -1))}
                onChange={updateNode}
              />
              {"value" in selected.node && moveOptions.length > 1 && (
                <label className={styles.field} htmlFor="sigwide-move-lane">
                  Bileşenin konumu
                  <select
                    id="sigwide-move-lane"
                    value={laneKey(selected.lane)}
                    onChange={(event) => {
                      const location = moveOptions.find((option) => option.key === event.target.value);
                      if (location) move(selected.node.id, location);
                    }}
                  >
                    {moveOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <div className={styles.inspectorBody}>
              <label className={styles.field} htmlFor="sigwide-font-stack">
                Yazı tipi
                <select
                  id="sigwide-font-stack"
                  value={layoutSettings.fontStack}
                  onChange={(e) => setLayoutSettings((prev) => ({ ...prev, fontStack: e.target.value }))}
                >
                  {!FONT_OPTIONS.some((opt) => opt.value === layoutSettings.fontStack) && (
                    <option value={layoutSettings.fontStack}>{layoutSettings.fontStack}</option>
                  )}
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field} htmlFor="sigwide-base-size">
                Temel yazı boyutu (px)
                <input
                  id="sigwide-base-size"
                  type="number"
                  min={11}
                  max={20}
                  value={layoutSettings.baseSize}
                  onChange={(e) =>
                    setLayoutSettings((prev) => ({
                      ...prev,
                      baseSize: Math.max(11, Math.min(20, Number(e.target.value) || 13)),
                    }))
                  }
                />
              </label>
              <div className={styles.inspectorThree}>
                <label className={styles.field} htmlFor="sigwide-color-text">
                  Metin
                  <input
                    id="sigwide-color-text"
                    type="color"
                    value={layoutSettings.colors.text}
                    onChange={(e) =>
                      setLayoutSettings((prev) => ({ ...prev, colors: { ...prev.colors, text: e.target.value } }))
                    }
                  />
                </label>
                <label className={styles.field} htmlFor="sigwide-color-link">
                  Bağlantı
                  <input
                    id="sigwide-color-link"
                    type="color"
                    value={layoutSettings.colors.link}
                    onChange={(e) =>
                      setLayoutSettings((prev) => ({ ...prev, colors: { ...prev.colors, link: e.target.value } }))
                    }
                  />
                </label>
                <label className={styles.field} htmlFor="sigwide-color-divider">
                  Ayırıcı
                  <input
                    id="sigwide-color-divider"
                    type="color"
                    value={layoutSettings.colors.divider}
                    onChange={(e) =>
                      setLayoutSettings((prev) => ({ ...prev, colors: { ...prev.colors, divider: e.target.value } }))
                    }
                  />
                </label>
              </div>
              <div className={styles.shortcutTips}>
                <span>
                  <kbd>Ctrl+Z</kbd> Geri al
                </span>
                <span>
                  <kbd>Ctrl+Y</kbd> İleri al
                </span>
                <span>
                  <kbd>Del</kbd> Sil
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </form>
  );
}
