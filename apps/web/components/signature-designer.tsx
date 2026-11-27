"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp, Columns2, GripVertical, ImagePlus, LayoutTemplate, Minus, Monitor, MoveVertical, Plus, Search, Smartphone, Text, Trash2, Type, UserRound } from "lucide-react";
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
  initial?: {
    id: string; name: string; layout: Layout; status: "draft" | "published"; version: number;
    appliesTo?: "both" | "new" | "reply"; priority?: number; senderGroup?: string;
    recipientScope?: "any" | "internal" | "external"; managedRule?: boolean;
  };
  sources: { label: string; values: FieldValues }[];
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  preview: (layout: Layout, values: FieldValues) => Promise<Preview>;
  profiles: { id: string; label: string; description: string; layout: Layout; appliesTo?: "both" | "new" | "reply" }[];
  fields: Field[];
  groups?: { id: string; displayName: string }[];
}

const EMPTY_LAYOUT: Layout = {
  version: 1, fontStack: "Arial, sans-serif", baseSize: 13, maxWidth: 480,
  colors: { text: "#172c3b", link: "#166b63", divider: "#bad7d2" }, elements: [],
};

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

function describe(node: Node, fields: Field[]) {
  if (!("value" in node)) return { label: "İki sütun", detail: "Yerleşim", icon: Columns2 };
  const value = node.value;
  const field = readField(value);
  if (field) return { label: fields.find((item) => item.key === field.key)?.label ?? field.key, detail: "Entra ID alanı", icon: UserRound };
  if (value.type === "text") return { label: value.text || "Boş metin", detail: "Metin", icon: Type };
  if (value.type === "image") return { label: value.alt || "Logo / görsel", detail: "Görsel", icon: ImagePlus };
  if (value.type === "divider") return { label: "Ayırıcı", detail: "Yatay çizgi", icon: Minus };
  if (value.type === "spacer") return { label: "Boşluk", detail: `${value.height} piksel`, icon: MoveVertical };
  return { label: value.type === "social" ? "Sosyal bağlantılar" : "Mevcut içerik", detail: "İmza bileşeni", icon: Text };
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("ı", "i");
}

function previewDocument(html: string) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:20px;color:#172c3b;overflow-wrap:anywhere}a{pointer-events:none}</style></head><body>${html}</body></html>`;
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

function Inspector({ active, fields, onChange, onUpload }: { active: Node; fields: Field[]; onChange: (next: Node) => void; onUpload: (active: boolean) => void }) {
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
        <label className={styles.field}>Entra ID alanı
          <select value={field.key} onChange={(e) => changeField(e.target.value, field.prefix)}>
            {!fields.some((item) => item.key === field.key) && <option value={field.key}>{field.key}</option>}
            {fields.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
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

export function SignatureDesigner({ initial, sources, action, preview, profiles, fields, groups = [] }: SignatureDesignerProps) {
  const starting = initial?.layout ?? profiles[0]?.layout ?? EMPTY_LAYOUT;
  const [design, setDesign] = useState(starting);
  const [nodes, setNodes] = useState(() => toNodes(starting.elements, "start"));
  const [name, setName] = useState(initial?.name ?? "");
  const [appliesTo, setAppliesTo] = useState(initial?.appliesTo ?? profiles[0]?.appliesTo ?? "both");
  const [manualMode, setManualMode] = useState(false);
  const [priority, setPriority] = useState(String(initial?.priority ?? 50));
  const [senderGroup, setSenderGroup] = useState(initial?.senderGroup ?? "");
  const [recipientScope, setRecipientScope] = useState(initial?.recipientScope ?? "any");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedLane, setSelectedLane] = useState<Lane>(null);
  const [preset, setPreset] = useState(initial ? "" : profiles[0]?.id);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(0);
  const [mode, setMode] = useState<"desktop" | "mobile" | "text">("desktop");
  const [rendered, setRendered] = useState<Preview>();
  const [previewError, setPreviewError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropZone, setDropZone] = useState<string>();
  const [currentUploads, setCurrentUploads] = useState(0);
  const [form, submit, saving] = useActionState(action, { errors: [] });
  const [edited, setEdited] = useState(false);
  const dragItem = useRef<{ id: string } | { value: Insert } | null>(null);
  const palette = useRef<HTMLElement>(null);
  const counter = useRef(0);
  const layout = useMemo(() => ({ ...design, elements: toElements(nodes) }), [design, nodes]);
  const selected = selectedId ? locate(nodes, selectedId) : undefined;
  const moveOptions = useMemo(() => [
    { lane: null, index: nodes.length, key: "root", label: "İmzanın ana alanı" },
    ...columnLanes(nodes),
  ], [nodes]);
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, Field[]>();
    const search = normalizeSearch(query.trim());
    for (const field of fields) {
      if (search && !normalizeSearch(`${field.label} ${field.key} ${field.group}`).includes(search)) continue;
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups];
  }, [fields, query]);

  useEffect(() => {
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
    setEdited(true);
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
    setEdited(true);
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
        const { label, detail, icon: Icon } = describe(node, fields);
        return <div key={node.id} className={styles.block}>
          <div className={styles.blockRow} data-selected={selectedId === node.id} {...dropTarget(lane, index)}>
            <span className={styles.grip} draggable onDragStart={(event) => dragStart(event, { id: node.id })} onDragEnd={dragEnd} title="Sıralamak için sürükleyin"><GripVertical size={16} /></span>
            <button type="button" className={styles.blockSelect} onClick={() => select(node, lane)} aria-pressed={selectedId === node.id}>
              <span className={styles.blockIcon}><Icon size={15} /></span>
              <span className={styles.blockText}><strong>{label}</strong><small>{detail}</small></span>
            </button>
            <div className={styles.blockActions}>
              <button type="button" title="Yukarı taşı" aria-label={`${label} yukarı taşı`} disabled={index === 0} onClick={() => move(node.id, { lane, index: index - 1 })}><ArrowUp size={14} /></button>
              <button type="button" title="Aşağı taşı" aria-label={`${label} aşağı taşı`} disabled={index === list.length - 1} onClick={() => move(node.id, { lane, index: index + 2 })}><ArrowDown size={14} /></button>
              <button type="button" title="Kaldır" aria-label={`${label} kaldır`} onClick={() => {
                setNodes((current) => inLane(current, lane, (part) => part.filter((item) => item.id !== node.id)));
                if (selectedId === node.id || (selectedId && locate([node], selectedId))) { setSelectedId(undefined); setSelectedLane(lane); }
                setEdited(true);
              }}><Trash2 size={14} /></button>
            </div>
          </div>
          {"columns" in node && <div className={styles.columns}>{node.columns.map((column, position) => <div className={styles.column} key={position}>
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
    <div className={styles.templateBar}>
      <label className={styles.field}>Şablon adı
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Genel şirket imzası" required maxLength={100} />
      </label>
      <button type="submit" disabled={saving || currentUploads > 0} className={styles.primary}>{saving ? "Kaydediliyor…" : initial?.status === "published" ? "Yayındaki imzayı kaydet" : "Taslağı kaydet"}</button>
      {initial?.status === "published" && <p className={styles.publishedNote}>Kaydedilen tasarım posta akışında kullanılır.</p>}
    </div>
    {(!initial || initial.managedRule) && <details className={styles.configuration}>
      <summary>Uygulama alanı</summary>
      <div className={styles.assignment}>
        <label className={styles.field}>Gönderenler
          <select name="senderGroup" value={senderGroup} onChange={(e) => setSenderGroup(e.target.value)}>
            <option value="">Tüm kullanıcılar</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.displayName}</option>)}
            {senderGroup && !groups.some((group) => group.id === senderGroup) && <option value={senderGroup}>Geçerli grup</option>}
          </select>
        </label>
        <label className={styles.field}>Alıcılar
          <select name="recipientScope" value={recipientScope} onChange={(e) => setRecipientScope(e.target.value as typeof recipientScope)}>
            <option value="any">Tüm alıcılar</option><option value="internal">Şirket içi</option><option value="external">Şirket dışı</option>
          </select>
        </label>
        <label className={styles.field}>İleti türü
          <select name="appliesTo" value={appliesTo} onChange={(e) => {
            setAppliesTo(e.target.value as typeof appliesTo);
            setManualMode(true);
          }}>
            <option value="both">Yeni ileti ve yanıt</option><option value="new">Yalnızca yeni ileti</option><option value="reply">Yalnızca yanıt</option>
          </select>
        </label>
        <label className={styles.field}>Öncelik
          <input type="number" name="priority" min={Math.min(1, initial?.priority ?? 1)} max={Math.max(999, initial?.priority ?? 999)} value={priority} onChange={(e) => setPriority(e.target.value)} title="Düşük sayı önce değerlendirilir" />
        </label>
      </div>
    </details>}
    {form.errors.length > 0 && <div role="alert" className={styles.errors}><ul>{form.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {!initial && profiles.length > 0 && <section className={styles.presets} aria-label="Başlangıç şablonları">
      {profiles.map((profile) => <button type="button" key={profile.id} className={styles.preset} aria-pressed={preset === profile.id} onClick={() => {
        if (profile.id === preset) return;
        if (edited && !window.confirm("Bu başlangıç şablonu mevcut tasarımın yerini alacak. Devam edilsin mi?")) return;
        setDesign(profile.layout);
        setNodes(toNodes(profile.layout.elements, `preset-${profile.id}`));
        setPreset(profile.id);
        setSelectedId(undefined);
        setSelectedLane(null);
        if (!manualMode) setAppliesTo(profile.appliesTo ?? "both");
        setEdited(false);
      }}><LayoutTemplate size={19} /><span><strong>{profile.label}</strong><small>{profile.description}</small></span></button>)}
    </section>}
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
        </div>
      </aside>
      <div className={styles.workSurface}>
        <section className={styles.preview} aria-label="İmza önizlemesi">
          <div className={styles.previewHeader}>
            <h2>Önizleme</h2>
            <div className={styles.previewTools}>
              {sources.length > 0 && <label className={styles.sample}><UserRound size={15} /><select aria-label="Önizleme kişisi" value={source} onChange={(e) => setSource(Number(e.target.value))}>{sources.map((item, index) => <option key={index} value={index}>{item.label}</option>)}</select></label>}
              <div className={styles.modes} role="group" aria-label="Önizleme biçimi">
                <button type="button" aria-label="Masaüstü" title="Masaüstü" aria-pressed={mode === "desktop"} onClick={() => setMode("desktop")}><Monitor size={16} /></button>
                <button type="button" aria-label="Mobil" title="Mobil" aria-pressed={mode === "mobile"} onClick={() => setMode("mobile")}><Smartphone size={16} /></button>
                <button type="button" aria-label="Düz metin" title="Düz metin" aria-pressed={mode === "text"} onClick={() => setMode("text")}><Text size={16} /></button>
              </div>
            </div>
          </div>
          <div className={styles.mailSurface} data-view={mode}>
            {nodes.length === 0 ? <p>Önizleme için bir bileşen ekleyin.</p> : previewError ? <p>Önizleme yüklenemedi.</p> : !rendered ? <p role="status">Önizleme hazırlanıyor…</p> : mode === "text" ? <pre>{rendered.text || "Düz metin içeriği yok."}</pre> : <iframe title="İmza önizlemesi" sandbox="" srcDoc={previewDocument(rendered.html)} />}
            {dragging && <div className={styles.previewDrop} {...dropTarget(null, nodes.length)}><Plus size={18} /> İmzanın sonuna bırakın</div>}
          </div>
          {nodes.length > 0 && rendered && rendered.missing.length > 0 && <p className={styles.missing}>Seçili kişide gizlenen alanlar: {rendered.missing.map((key) => fields.find((field) => field.key === key)?.label ?? key).join(", ")}</p>}
        </section>
        <section className={styles.structure} aria-label="İmza yerleşimi">
          <div className={styles.structureTitle}><h2>Yerleşim</h2><small>Bileşenleri sürükleyin veya oklarla sıralayın.</small></div>
          <div className={styles.structureContent}>
            {renderLane(nodes, null)}
            {selected && <div className={styles.inspector} aria-label="Bileşen ayarları">
              <h3>{describe(selected.node, fields).label}</h3>
              <Inspector key={selected.node.id} active={selected.node} fields={fields} onUpload={(active) => setCurrentUploads((count) => count + (active ? 1 : -1))} onChange={(next) => {
                setNodes((current) => {
                  const position = locate(current, next.id);
                  return position ? inLane(current, position.lane, (part) => part.map((node) => node.id === next.id ? next : node)) : current;
                });
                setEdited(true);
              }} />
              {"value" in selected.node && moveOptions.length > 1 && <label className={styles.field}>Bileşenin konumu
                <select value={laneKey(selected.lane)} onChange={(event) => {
                  const location = moveOptions.find((option) => option.key === event.target.value);
                  if (location) move(selected.node.id, location);
                }}>{moveOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
              </label>}
            </div>}
          </div>
        </section>
      </div>
    </div>
  </form>;
}
