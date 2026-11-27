import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "@sing365/db";
import { env } from "./env";

export const SIGNATURE_ASSET_MAX_BYTES = 512 * 1024;
export const SIGNATURE_ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type ImageType = "image/png" | "image/jpeg" | "image/gif";
interface ImageInfo {
  contentType: ImageType;
  width: number;
  height: number;
}

export function signatureAssetOrigin(): string | null {
  try {
    const url = new URL(env.publicUrl);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol === "https:") return url.origin;
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function jpegDimensions(bytes: Buffer): ImageInfo | null {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (JPEG_FRAME_MARKERS.has(marker)) {
      if (length < 8) return null;
      return { contentType: "image/jpeg", width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

export function inspectSignatureImage(bytes: Buffer): ImageInfo | null {
  if (bytes.length > SIGNATURE_ASSET_MAX_BYTES) return null;
  let image: ImageInfo | null = null;
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR"
    && bytes.readUInt32BE(bytes.length - 12) === 0 && bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND") {
    image = { contentType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (bytes.length >= 14 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6)) && bytes.at(-1) === 0x3b) {
    image = { contentType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (bytes.length >= 12 && bytes.readUInt16BE(0) === 0xffd8 && bytes.readUInt16BE(bytes.length - 2) === 0xffd9) {
    image = jpegDimensions(bytes);
  }
  if (!image || image.width < 1 || image.height < 1 || image.width > 2048 || image.height > 2048) return null;
  return image;
}

export async function storeSignatureAsset(db: Db, tenantId: string, bytes: Buffer, info: ImageInfo): Promise<string> {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return db.forTenant(tenantId, async (tx) => {
    const [inserted] = await tx<{ id: string }[]>`
      insert into assets (id, tenant_id, kind, storage_key, content_type, bytes, width, height, sha256, signature_content)
      values (${id}, ${tenantId}, 'logo', ${`signature-assets/${id}`}, ${info.contentType}, ${bytes.length},
        ${info.width}, ${info.height}, ${sha256}, ${bytes})
      on conflict (tenant_id, sha256) where signature_content is not null do nothing
      returning id
    `;
    if (inserted) return inserted.id;
    const [existing] = await tx<{ id: string }[]>`
      select id from assets where tenant_id = ${tenantId} and sha256 = ${sha256} and signature_content is not null
    `;
    if (!existing) throw new Error("Signature asset insert did not return an ID");
    return existing.id;
  });
}

const localAssetsKey = Symbol.for("sigwide.localSignatureAssets");
type LocalAssetEntry = { content_type: ImageType; signature_content: Buffer };
type LocalAssetStore = Map<string, LocalAssetEntry>;

function localAssetStore(): LocalAssetStore {
  const g = globalThis as Record<symbol, LocalAssetStore | undefined>;
  if (!g[localAssetsKey]) g[localAssetsKey] = new Map();
  return g[localAssetsKey]!;
}

export function isLocalAssetDemoMode(db: Db | null): boolean {
  return !db && process.env.NODE_ENV !== "production";
}

export function isLoopbackOrigin(value: string | null): value is string {
  if (!value || process.env.NODE_ENV === "production") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function storeLocalSignatureAsset(bytes: Buffer, info: ImageInfo): string {
  const id = randomUUID();
  localAssetStore().set(id, { content_type: info.contentType, signature_content: bytes });
  return id;
}

export function readLocalSignatureAsset(id: string): LocalAssetEntry | undefined {
  return localAssetStore().get(id);
}

export function readSignatureAsset(db: Db, id: string) {
  return db.sql.begin(async (tx) => {
    await tx`select set_config('app.signature_asset_id', ${id}, true)`;
    const [asset] = await tx<{ content_type: ImageType; signature_content: Buffer }[]>`
      select content_type, signature_content from assets where id = ${id} and signature_content is not null
    `;
    return asset;
  });
}
