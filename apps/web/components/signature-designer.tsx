"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp, Columns2, GripVertical, ImagePlus, Minus, Monitor, MousePointer2, MoveVertical, Plus, Save, Search, Smartphone, Text, Trash2, Type, UserRound } from "lucide-react";
import type { Element, FieldValues, Layout, TextStyle } from "@sing365/render";
import styles from "./signature-designer.module.css";

type Columns = Extract<Element, { type: "columns" }>;
type Leaf = Exclude<Element, Columns>;
type Node = { id: string; value: Leaf } | { id: string; gap?: number; columns: { width?: number; nodes: Node[] }[] };
type Lane = { owner: string; column: number } | null;
type Located = { node: Node; lane: Lane; index: number; count: number };
type Insert = Leaf | Columns;
type Zone = { lane: Lane; index: number };
type LaneOption = Zone & { key: string; label: string };
type Preview = { html: string; text: string; missing: string[] };
type Field = { key: string; label: string; group: string };
type FormState = { errors: string[] };

export interface SignatureDesignerProps {
  initial?: { id: string; name: string; layout: Layout; status: "draft" | "published"; version: number };
  sources: { label: string; values: FieldValues }[];
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  preview: (layout: Layout, values: FieldValues) => Promise<Preview>;
  fields: Field[];
}

const EMPTY_LAYOUT: Layout = {
  version: 1, fontStack: "Arial, sans-serif", baseSize: 13, maxWidth: 480,
  colors: { text: "#172c3b", link: "#166b63", divider: "#bad7d2" }, elements: [],
};

const EXTENSION_NAMES = Array.from({ length: 15 }, (_, index) => `extensionAttribute${index + 1}`);
const FIELD_TOKEN = /\{\{\s*([a-z][a-z0-9_.]*)\s*(?:\|\s*(upper|lower)\s*)?\}\}/gi;

function extensionKey(raw: string): string | undefined {
  const name = /^(?:ext\.)?extensionattribute([1-9]|1[0-5])$/i.exec(raw.trim());
  return name ? `ext.extensionattribute${name[1]}` : undefined;
}

function extensionName(key: string): string {
  return key.replace(/^ext\.extensionattribute/i, "extensionAttribute");
}

const INSERTS: { label: string; icon: typeof Type; value: Insert }[] = [
  { label: "Metin", icon: Type, value: { type: "text", text: "Yeni metin" } },
  { label: "Logo / görsel", icon: ImagePlus, value: { type: "image", src: "", alt: "Şirket logosu", width: 110, height: 40 } },
  { label: "Ayırıcı", icon: Minus, value: { type: "divider" } },
  { label: "Boşluk", icon: MoveVertical, value: { type: "spacer", height: 8 } },
  { label: "İki sütun", icon: Columns2, value: { type: "columns", columns: [{ elements: [] }, { elements: [] }], gap: 16 } },
];

function toNodes(elements: Element[], prefix: string): Node[] {
  return elements.map((value, index) => {
    const id = `${prefix}-${index}`;
    return value.type === "columns"
      ? { id, gap: value.gap, columns: value.columns.map((c, i) => ({ width: c.width, nodes: toNodes(c.elements, `${id}-${i}`) })) }
      : { id, value };
  });
}

function toElements(nodes: Node[]): Element[] {
  return nodes.map((node) => "value" in node ? node.value : {
    type: "columns", gap: node.gap, columns: node.columns.map((c) => ({ width: c.width, elements: toElements(c.nodes) })),
  });
}

function visiblePreviewElements(elements: Element[]): Element[] {
  return elements.filter((element) => element.type !== "image" || element.src.trim()).map((element) =>
    element.type === "columns"
      ? { ...element, columns: element.columns.map((column) => ({ ...column, elements: visiblePreviewElements(column.elements) })) }
      : element,
  );
}

function locate(nodes: Node[], id: string, lane: Lane = null): Located | undefined {
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

function inLane(nodes: Node[], lane: Lane, change: (nodes: Node[]) => Node[]): Node[] {
  if (!lane) return change(nodes);
  return nodes.map((node) => "columns" in node ? {
    ...node,
    columns: node.columns.map((column, index) => {
      if (node.id === lane.owner) return index === lane.column ? { ...column, nodes: change(column.nodes) } : column;
      return { ...column, nodes: inLane(column.nodes, lane, change) };
    }),
  } : node);
}

function insertAt(nodes: Node[], index: number, value: Node): Node[] {
  return [...nodes.slice(0, index), value, ...nodes.slice(index)];
}

function laneKey(lane: Lane) {
  return lane ? `${lane.owner}/${lane.column}` : "root";
}

function columnLanes(nodes: Node[], prefix = ""): LaneOption[] {
  return nodes.filter((node) => "columns" in node).flatMap((node, index) => {
    const section = `${prefix}${index + 1}`;
    return node.columns.flatMap((column, position) => {
      const lane = { owner: node.id, column: position };
      return [
        { lane, index: column.nodes.length, key: laneKey(lane), label: `Düzen ${section} · Sütun ${position + 1}` },
        ...columnLanes(column.nodes, `${section}.${position + 1}.`),
      ];
    });
  });
}

function readField(element: Element): { key: string; prefix: string; modifier?: string } | undefined {
  if (element.type !== "text") return;
  const match = /^([^{}]*)\{\{([a-z][a-z0-9_.]*)(?:\|(upper|lower))?\}\}$/i.exec(element.text);
  if (match) return { prefix: match[1]!.replace(/ $/, ""), key: match[2]!.toLowerCase(), modifier: match[3] };
}

function fieldElement(key: string, prefix = "", modifier?: string): Extract<Element, { type: "text" }> {
  const placeholder = `{{${key}${modifier ? `|${modifier}` : ""}}}`;
  const scheme = key === "email" ? "mailto:" : key === "business_phone" || key === "mobile_phone" ? "tel:" : null;
  return { type: "text", text: `${prefix ? `${prefix} ` : ""}${placeholder}`, href: scheme ? `${scheme}{{${key}}}` : undefined };
}

function blockLabel(node: Node, fields: Field[]): string {
  if (!("value" in node)) return "İki sütun";
  const value = node.value;
  const field = readField(value);
  if (field) return extensionKey(field.key) ? extensionName(field.key) : fields.find((item) => item.key === field.key)?.label ?? field.key;
  if (value.type === "text") return value.text || "Boş metin";
  if (value.type === "image") return value.alt || "Logo / görsel";
  if (value.type === "divider") return "Ayırıcı";
  if (value.type === "spacer") return "Boşluk";
  return value.type === "social" ? "Sosyal bağlantılar" : "Mevcut içerik";
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("ı", "i");
}

function CustomFieldInput({ list, initialKey = "", buttonText, onChoose }: { list: string; initialKey?: string; buttonText: string; onChoose: (key: string) => void }) {
  const [attribute, setAttribute] = useState(extensionName(initialKey));
  const normalized = extensionKey(attribute);
  function choose() {
    if (!normalized) return;
    onChoose(normalized);
    setAttribute(initialKey ? extensionName(normalized) : "");
  }
  return <div className={styles.customChoice}>
    <label className={styles.field}>Entra uzantısı
      <input value={attribute} onChange={(event) => setAttribute(event.target.value)} onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        choose();
      }} list={list} maxLength={32} autoComplete="off" spellCheck={false} placeholder="extensionAttribute1" />
    </label>
    <button className={styles.customButton} type="button" onClick={choose} disabled={!normalized}>{buttonText}</button>
    {attribute && !normalized && <p className={styles.smallNote}>extensionAttribute1–15 arasından bir alan seçin.</p>}
  </div>;
}

function canvasText(text: string, values: FieldValues) {
  let hasField = false;
  let hasValue = false;
  const value = text.replace(FIELD_TOKEN, (_match, key: string, modifier?: string) => {
    hasField = true;
    const entry = values[key.toLowerCase()]?.trim() ?? "";
    hasValue ||= Boolean(entry);
    if (modifier?.toLowerCase() === "upper") return entry.toLocaleUpperCase("tr-TR");
    if (modifier?.toLowerCase() === "lower") return entry.toLocaleLowerCase("tr-TR");
    return entry;
  });
  return { value, missing: hasField && !hasValue };
}

function CanvasItem({ node, values, layout, label }: { node: Node; values: FieldValues; layout: Layout; label: string }) {
  if ("columns" in node) return <span className={styles.canvasCaption}><Columns2 size={14} /> {label}</span>;
  const block = node.value;
  switch (block.type) {
    case "text": {
      const { value, missing } = canvasText(block.text, values);
      if (missing || !value.trim()) return <span className={styles.canvasPlaceholder}>{label}{missing ? " · boş" : ""}</span>;
      return <span className={styles.canvasValue} style={{
        fontFamily: layout.fontStack,
        fontSize: block.style?.size ?? layout.baseSize ?? 13,
        fontWeight: block.style?.bold ? 700 : 400,
        fontStyle: block.style?.italic ? "italic" : "normal",
        color: block.style?.color ?? (block.href ? layout.colors.link : layout.colors.text),
      }}>{value}</span>;
    }
    case "image":
      if (/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/signature-assets\/)/i.test(block.src)) {
        return <img className={styles.canvasImage} src={block.src} alt={block.alt} width={block.width} height={block.height} draggable={false} referrerPolicy="no-referrer" />;
      }
      return <span className={styles.canvasPlaceholder}><ImagePlus size={14} /> {label}</span>;
    case "divider":
      return <span className={styles.canvasDivider} style={{ backgroundColor: block.color ?? layout.colors.divider }} />;
    case "spacer":
      return <span className={styles.canvasGap} style={{ height: Math.max(4, Math.min(48, block.height)) }}><span>{block.height} px</span></span>;
    default:
      return <span className={styles.canvasCaption}>{label}</span>;
  }
}

function CanvasRuler({ width }: { width: number }) {
  const ticks = [0, ...Array.from({ length: Math.floor((width - 36) / 100) }, (_, index) => (index + 1) * 100), width];
  return <div className={styles.ruler} aria-label={`Yerleşim cetveli, ${width} piksel`} style={{ backgroundSize: `${5000 / width}% 7px, ${1000 / width}% 4px` }}>
    {ticks.map((tick) => <span key={tick} style={{ left: `${tick / width * 100}%` }}>{tick === width ? `${tick} px` : tick}</span>)}
  </div>;
}

function previewDocument(html: string) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>:root{color-scheme:light;background:#fff}body{margin:0;padding:20px;color:#172c3b;overflow-wrap:anywhere}a{pointer-events:none}</style></head><body>${html}</body></html>`;
}

function ImageInspector({ block, update, onUpload }: { block: Extract<Leaf, { type: "image" }>; update: (value: Leaf) => void; onUpload: (active: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function upload(file: File) {
    if (file.size > 512 * 1024) {
      setUploadError("Görsel en fazla 512 KB olabilir.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    setUploading(true);
    onUpload(true);
    setUploadError("");
    try {
      const response = await fetch("/api/signature-assets", { method: "POST", body });
      const asset = await response.json().catch(() => ({})) as { url?: string; width?: number; height?: number; error?: string };
      if (!response.ok || !asset.url || !asset.width || !asset.height) throw new Error(asset.error ?? "Görsel yüklenemedi.");
      const scale = Math.min(1, 160 / asset.width, 120 / asset.height);
      update({ ...block, src: asset.url, width: Math.max(1, Math.round(asset.width * scale)), height: Math.max(1, Math.round(asset.height * scale)) });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Görsel yüklenemedi.");
    } finally {
      setUploading(false);
      onUpload(false);
    }
  }

  return <>
    <label className={`${styles.field} ${styles.upload}`}>Görsel yükle
      <input type="file" accept="image/png,image/jpeg,image/gif" disabled={uploading} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }} />
    </label>
    {uploading && <p role="status" className={styles.smallNote}>Görsel yükleniyor…</p>}
    {uploadError && <p role="alert" className={styles.uploadError}>{uploadError}</p>}
    <label className={styles.field}>Görsel adresi
      <input type="url" value={block.src} disabled={uploading} placeholder="https://" onChange={(e) => update({ ...block, src: e.target.value })} />
    </label>
    <label className={styles.field}>Alternatif metin
      <input value={block.alt} disabled={uploading} maxLength={100} onChange={(e) => update({ ...block, alt: e.target.value })} />
    </label>
    <div className={styles.inspectorRow}>
      <label className={styles.field}>Genişlik (px)<input type="number" min={1} max={480} disabled={uploading} value={block.width} onChange={(e) => update({ ...block, width: Number(e.target.value) })} /></label>
      <label className={styles.field}>Yükseklik (px)<input type="number" min={1} max={300} disabled={uploading} value={block.height} onChange={(e) => update({ ...block, height: Number(e.target.value) })} /></label>
    </div>
    <label className={styles.field}>Bağlantı <span>(isteğe bağlı)</span>
      <input type="url" value={block.href ?? ""} disabled={uploading} placeholder="https://" onChange={(e) => update({ ...block, href: e.target.value || undefined })} />
    </label>
  </>;
}

function Inspector({ active, fields, customList, onChange, onUpload }: { active: Node; fields: Field[]; customList: string; onChange: (next: Node) => void; onUpload: (active: boolean) => void }) {
  const update = (value: Leaf) => onChange({ id: active.id, value });
  if ("columns" in active) return <label className={styles.field}>Sütun aralığı (px)
    <input type="number" min={0} max={32} value={active.gap ?? 16} onChange={(e) => onChange({ ...active, gap: Number(e.target.value) })} />
  </label>;
  const block = active.value;
  if (block.type === "text") {
    const field = readField(block);
    const changeStyle = (style: Partial<TextStyle>) => update({ ...block, style: { ...block.style, ...style } });
    function changeField(key: string, prefix: string) {
      if (block.type === "text") update({ ...block, ...fieldElement(key, prefix, field?.modifier) });
    }
    return <>
      {field ? <>
        {extensionKey(field.key) ? <CustomFieldInput list={customList} initialKey={field.key} buttonText="Alanı değiştir" onChoose={(key) => changeField(key, field.prefix)} /> : <label className={styles.field}>Entra ID alanı
          <select value={field.key} onChange={(e) => changeField(e.target.value, field.prefix)}>
            {!fields.some((item) => item.key === field.key) && <option value={field.key}>{field.key}</option>}
            {fields.filter((item) => !extensionKey(item.key)).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>}
        <label className={styles.field}>Alanın başına metin <span>(isteğe bağlı)</span>
          <input type="text" value={field.prefix} maxLength={70} placeholder="Örn. Telefon:" onChange={(e) => changeField(field.key, e.target.value)} />
        </label>
        <p className={styles.smallNote}>Kişide bu bilgi yoksa satır gizlenir.</p>
      </> : <>
        <label className={styles.field}>Metin
          <input type="text" value={block.text} maxLength={300} onChange={(e) => update({ ...block, text: e.target.value })} />
        </label>
        <label className={styles.field}>Bağlantı <span>(isteğe bağlı)</span>
          <input type="url" value={block.href ?? ""} placeholder="https://" onChange={(e) => update({ ...block, href: e.target.value || undefined })} />
        </label>
      </>}
      <div className={styles.inspectorRow}>
        <label className={styles.field}>Metin boyutu
          <input type="number" min={11} max={20} value={block.style?.size ?? 13} onChange={(e) => changeStyle({ size: Number(e.target.value) })} />
        </label>
        <label className={styles.field}>Metin rengi
          <input type="color" value={block.style?.color ?? "#172c3b"} onChange={(e) => changeStyle({ color: e.target.value })} />
        </label>
      </div>
      <label className={styles.checkbox}><input type="checkbox" checked={block.style?.bold ?? false} onChange={(e) => changeStyle({ bold: e.target.checked })} /> Kalın metin</label>
    </>;
  }
  if (block.type === "image") return <ImageInspector block={block} update={update} onUpload={onUpload} />;
  if (block.type === "divider") return <label className={styles.field}>Çizgi rengi
    <input type="color" value={block.color ?? "#bad7d2"} onChange={(e) => update({ ...block, color: e.target.value })} />
  </label>;
  if (block.type === "spacer") return <label className={styles.field}>Boşluk yüksekliği (px)
    <input type="number" min={1} max={48} value={block.height} onChange={(e) => update({ ...block, height: Number(e.target.value) })} />
  </label>;
  return <p className={styles.smallNote}>Bu bileşenin yerini değiştirebilir veya bileşeni kaldırabilirsiniz.</p>;
}

export function SignatureDesigner({ initial, sources, action, preview, fields }: SignatureDesignerProps) {
  const starting = initial?.layout ?? EMPTY_LAYOUT;
  const [nodes, setNodes] = useState(() => toNodes(starting.elements, "start"));
  const [name, setName] = useState(initial?.name ?? "");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedLane, setSelectedLane] = useState<Lane>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(0);
  const [mode, setMode] = useState<"placement" | "desktop" | "mobile" | "text">("placement");
  const customList = useId();
  const [rendered, setRendered] = useState<Preview>();
  const [previewError, setPreviewError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropZone, setDropZone] = useState<string>();
  const [currentUploads, setCurrentUploads] = useState(0);
  const [form, submit, saving] = useActionState(action, { errors: [] });
  const dragItem = useRef<{ id: string } | { value: Insert } | null>(null);
  const palette = useRef<HTMLElement>(null);
  const counter = useRef(0);
  const layout = useMemo(() => ({ ...starting, elements: toElements(nodes) }), [starting, nodes]);
  const canvasWidth = Math.max(160, Math.min(600, layout.maxWidth ?? 600));
  const profile = sources[source]?.values ?? {};
  const selected = selectedId ? locate(nodes, selectedId) : undefined;
  const moveOptions = useMemo(() => [
    { lane: null, index: nodes.length, key: "root", label: "İmzanın ana alanı" },
    ...columnLanes(nodes),
  ], [nodes]);
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

  useEffect(() => {
    if (layout.elements.length === 0) return;
    let current = true;
    const timer = setTimeout(() => {
      void preview({ ...layout, elements: visiblePreviewElements(layout.elements) }, sources[source]?.values ?? {}).then((result) => {
        if (!current) return;
        setRendered(result);
        setPreviewError(false);
      }).catch(() => { if (current) setPreviewError(true); });
    }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [layout, preview, source, sources]);

  function select(node: Node, lane: Lane) {
    setSelectedId(node.id);
    setSelectedLane(lane);
  }

  function append(value: Insert, zone?: Zone) {
    const lane = zone ? zone.lane : value.type === "columns" ? null : selectedLane;
    if (lane && value.type === "columns") return;
    counter.current++;
    const node = toNodes([value], `added-${counter.current}`)[0]!;
    setNodes((current) => inLane(current, lane, (part) => insertAt(part, zone?.index ?? part.length, node)));
    select(node, lane);
    setMode("placement");
  }

  function move(id: string, zone: Zone) {
    const from = locate(nodes, id);
    if (!from || (zone.lane && "columns" in from.node)) return;
    const sameLane = from.lane?.owner === zone.lane?.owner && from.lane?.column === zone.lane?.column;
    const index = zone.index - (sameLane && from.index < zone.index ? 1 : 0);
    if (sameLane && index === from.index) return;
    setNodes((current) => {
      const removed = inLane(current, from.lane, (part) => part.filter((node) => node.id !== id));
      return inLane(removed, zone.lane, (part) => insertAt(part, index, from.node));
    });
    select(from.node, zone.lane);
  }

  function dragStart(event: DragEvent, spec: NonNullable<typeof dragItem.current>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "id" in spec ? "move" : "copy";
    event.dataTransfer.setData("text/plain", "Sigwide");
    dragItem.current = spec;
    setDragging(true);
    setMode("placement");
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

  function dropTarget(lane: Lane, index: number) {
    const key = `${laneKey(lane)}/${index}`;
    return {
      "data-over": dropZone === key,
      onDragOver: (event: DragEvent) => {
        if (!dragItem.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "id" in dragItem.current ? "move" : "copy";
        setDropZone(key);
      },
      onDrop: (event: DragEvent) => drop(event, { lane, index }),
    };
  }

  function renderLane(list: Node[], lane: Lane): ReactNode {
    const focused = selectedLane?.owner === lane?.owner && selectedLane?.column === lane?.column;
    return <div className={lane ? styles.lane : styles.rootLane}>
      {list.map((node, index) => {
        const label = blockLabel(node, fields);
        return <div key={node.id} className={styles.block}>
          <div className={styles.blockRow} data-selected={selectedId === node.id} {...dropTarget(lane, index)}>
            <span className={styles.grip} draggable onDragStart={(event) => dragStart(event, { id: node.id })} onDragEnd={dragEnd} title="Sıralamak için sürükleyin"><GripVertical size={16} /></span>
            <button type="button" className={styles.blockSelect} draggable onDragStart={(event) => dragStart(event, { id: node.id })} onDragEnd={dragEnd} onClick={() => select(node, lane)} aria-pressed={selectedId === node.id} aria-label={`${label} düzenle`}>
              <CanvasItem node={node} values={profile} layout={layout} label={label} />
            </button>
            <div className={styles.blockActions}>
              <button type="button" title="Yukarı taşı" aria-label={`${label} yukarı taşı`} disabled={index === 0} onClick={() => move(node.id, { lane, index: index - 1 })}><ArrowUp size={14} /></button>
              <button type="button" title="Aşağı taşı" aria-label={`${label} aşağı taşı`} disabled={index === list.length - 1} onClick={() => move(node.id, { lane, index: index + 2 })}><ArrowDown size={14} /></button>
              <button type="button" title="Kaldır" aria-label={`${label} kaldır`} onClick={() => {
                setNodes((current) => inLane(current, lane, (part) => part.filter((item) => item.id !== node.id)));
                if (selectedId === node.id || (selectedId && locate([node], selectedId))) { setSelectedId(undefined); setSelectedLane(lane); }
              }}><Trash2 size={14} /></button>
            </div>
          </div>
          {"columns" in node && <div className={styles.columns} style={{ gap: node.gap }}>{node.columns.map((column, position) => <div className={styles.column} key={position} style={column.width ? { flexBasis: column.width } : undefined}>
            <div className={styles.columnTitle}>Sütun {position + 1}</div>
            {renderLane(column.nodes, { owner: node.id, column: position })}
          </div>)}</div>}
        </div>;
      })}
      <button type="button" className={styles.laneEnd} data-active={focused} data-dragging={dragging} {...dropTarget(lane, list.length)} onClick={() => {
        setSelectedLane(lane);
        setSelectedId(undefined);
        palette.current?.querySelector("button")?.focus();
      }}>
        <Plus size={14} /> {lane ? "Bu sütuna ekle" : list.length ? "Sona ekle" : "Bileşen seçin veya buraya sürükleyin"}
      </button>
    </div>;
  }

  return <form className={styles.designer} action={submit}>
    {initial && <><input type="hidden" name="id" value={initial.id} /><input type="hidden" name="version" value={initial.version} /></>}
    <input type="hidden" name="layout" value={JSON.stringify(layout)} />
    <datalist id={customList}>{EXTENSION_NAMES.map((name) => <option key={name} value={name} label={profile[extensionKey(name)!] ?? undefined} />)}</datalist>
    <div className={styles.templateBar}>
      <label className={styles.field}>Şablon adı
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Genel şirket imzası" required maxLength={100} />
      </label>
      <button type="submit" disabled={saving || currentUploads > 0} className={styles.primary}>
        <Save size={16} aria-hidden="true" /> {saving ? "Kaydediliyor…" : initial?.status === "published" ? "Değişiklikleri kaydet" : "Taslağı kaydet"}
      </button>
      {initial?.status === "published" && <p className={styles.publishedNote}>Bu imza yayında. Kaydedilen tasarım sonraki iletilerde kullanılır.</p>}
    </div>
    {form.errors.length > 0 && <div role="alert" className={styles.errors}><ul>{form.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <div className={styles.workspace}>
      <aside className={styles.palette} ref={palette} aria-label="İmza bileşenleri">
        <h2>Bileşenler</h2>
        <div className={styles.inserts}>{INSERTS.map(({ label, value, icon: Icon }) => <button key={label} type="button" onClick={() => append(value)} draggable onDragStart={(event) => dragStart(event, { value })} onDragEnd={dragEnd} className={styles.insert}><Icon size={17} /><span>{label}</span></button>)}</div>
        <div className={styles.directory}>
          <h2>Entra ID alanları</h2>
          <label className={styles.search}><Search size={16} /><input type="search" aria-label="Entra ID alanı ara" placeholder="Alan ara" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className={styles.directoryItems}>
            {fieldGroups.map(([group, items]) => <div key={group}><h3>{group}</h3>{items.map((field) => {
              const value = fieldElement(field.key);
              return <button type="button" key={field.key} className={styles.directoryField} draggable onDragStart={(event) => dragStart(event, { value })} onDragEnd={dragEnd} onClick={() => append(value)}>{field.label}<Plus size={14} /></button>;
            })}</div>)}
            {fieldGroups.length === 0 && <p className={styles.smallNote}>Eşleşen alan bulunamadı.</p>}
          </div>
          <details className={styles.customAdd}>
            <summary><Plus size={15} aria-hidden="true" /> Özel alan ekle</summary>
            <CustomFieldInput list={customList} buttonText="Ekle" onChoose={(key) => append(fieldElement(key))} />
          </details>
        </div>
      </aside>
      <div className={styles.workSurface}>
        <section className={styles.preview} aria-label="İmza önizlemesi">
          <div className={styles.previewHeader}>
            <h2>Önizleme</h2>
            <div className={styles.previewTools}>
              {sources.length > 0 && <label className={styles.sample}><UserRound size={15} /><select aria-label="Önizleme kişisi" value={source} onChange={(e) => setSource(Number(e.target.value))}>{sources.map((item, index) => <option key={index} value={index}>{item.label}</option>)}</select></label>}
              <div className={styles.modes} role="group" aria-label="Önizleme biçimi">
                <button type="button" className={styles.placeMode} aria-pressed={mode === "placement"} onClick={() => setMode("placement")}><MousePointer2 size={15} aria-hidden="true" /> Yerleştir</button>
                <button type="button" aria-label="Masaüstü" title="Masaüstü" aria-pressed={mode === "desktop"} onClick={() => setMode("desktop")}><Monitor size={16} /></button>
                <button type="button" aria-label="Mobil" title="Mobil" aria-pressed={mode === "mobile"} onClick={() => setMode("mobile")}><Smartphone size={16} /></button>
                <button type="button" aria-label="Düz metin" title="Düz metin" aria-pressed={mode === "text"} onClick={() => setMode("text")}><Text size={16} /></button>
              </div>
            </div>
          </div>
          {mode === "placement" ? <>
            <div className={styles.canvasPanel} aria-label="İmza yerleşimi">
              <div className={styles.canvasSheet} style={{ maxWidth: canvasWidth }}>
                <CanvasRuler width={canvasWidth} />
                <div className={styles.canvasBody} {...dropTarget(null, nodes.length)}>{renderLane(nodes, null)}</div>
              </div>
            </div>
            <p className={styles.canvasHelp}>Bileşenleri istediğiniz satıra veya sütuna bırakın.</p>
            {selected && <div className={styles.inspector} aria-label="Bileşen ayarları">
              <h3>{blockLabel(selected.node, fields)}</h3>
              <Inspector key={selected.node.id} active={selected.node} fields={fields} customList={customList} onUpload={(active) => setCurrentUploads((count) => count + (active ? 1 : -1))} onChange={(next) => {
                setNodes((current) => {
                  const position = locate(current, next.id);
                  return position ? inLane(current, position.lane, (part) => part.map((node) => node.id === next.id ? next : node)) : current;
                });
              }} />
              {"value" in selected.node && moveOptions.length > 1 && <label className={styles.field}>Bileşenin konumu
                <select value={laneKey(selected.lane)} onChange={(event) => {
                  const location = moveOptions.find((option) => option.key === event.target.value);
                  if (location) move(selected.node.id, location);
                }}>{moveOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
              </label>}
            </div>}
          </> : <>
            <div className={styles.mailSurface} data-view={mode}>
              {nodes.length === 0 ? <p>Önizleme için bir bileşen ekleyin.</p> : previewError ? <p>Önizleme yüklenemedi.</p> : !rendered ? <p role="status">Önizleme hazırlanıyor…</p> : mode === "text" ? <pre>{rendered.text || "Düz metin içeriği yok."}</pre> : <iframe title="İmza önizlemesi" sandbox="" srcDoc={previewDocument(rendered.html)} />}
            </div>
            {nodes.length > 0 && rendered && rendered.missing.length > 0 && <p className={styles.missing}>Seçili kişide gizlenen alanlar: {rendered.missing.map((key) => extensionKey(key) ? extensionName(key) : fields.find((field) => field.key === key)?.label ?? key).join(", ")}</p>}
          </>}
        </section>
      </div>
    </div>
  </form>;
}
