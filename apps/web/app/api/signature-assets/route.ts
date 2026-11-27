import { getDb } from "@/lib/data";
import { readSession } from "@/lib/session";
import {
  inspectSignatureImage,
  isLocalAssetDemoMode,
  isLoopbackOrigin,
  SIGNATURE_ASSET_MAX_BYTES,
  signatureAssetOrigin,
  storeLocalSignatureAsset,
  storeSignatureAsset,
} from "@/lib/signature-assets";

const MAX_BODY_BYTES = SIGNATURE_ASSET_MAX_BYTES + 8 * 1024;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let received = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return bytes.subarray(0, received);
      if (received + value.byteLength > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, received);
      received += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const db = getDb();
  const demoMode = isLocalAssetDemoMode(db);
  const reqOrigin = request.headers.get("origin");
  const configuredOrigin = signatureAssetOrigin();
  const origin = demoMode && isLoopbackOrigin(reqOrigin) ? reqOrigin : configuredOrigin;
  if ((!db && !demoMode) || !origin) return error("Bu ortamda logo yükleme yapılandırılmamış.", 503);
  if (reqOrigin !== origin) return error("Geçersiz yükleme isteği.", 403);
  const session = demoMode ? null : await readSession();
  const tenantId = session?.tenantId;
  if (!demoMode && !tenantId) return error("Logo yüklemek için oturum açmalısınız.", 401);

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return error("Bir görsel dosyası seçin.", 415);
  const tooLarge = () => error("Logo en fazla 512 KB olabilir.", 413);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge();

  let file: FormDataEntryValue | null;
  try {
    const bytes = await readBody(request);
    if (!bytes) return tooLarge();
    const form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
    file = form.get("file");
  } catch {
    return error("Görsel dosyası okunamadı.", 400);
  }
  if (!file || typeof file === "string") return error("Bir görsel dosyası seçin.", 400);
  if (file.size > SIGNATURE_ASSET_MAX_BYTES) return tooLarge();
  const bytes = Buffer.from(await file.arrayBuffer());
  const info = inspectSignatureImage(bytes);
  if (!info) return error("En fazla 2048 × 2048 piksel boyutunda bir PNG, JPEG veya GIF dosyası seçin.", 415);

  try {
    const id = demoMode ? storeLocalSignatureAsset(bytes, info) : await storeSignatureAsset(db!, tenantId!, bytes, info);
    return Response.json({ url: `${origin}/api/signature-assets/${id}`, width: info.width, height: info.height }, { status: 201 });
  } catch {
    return error("Logo kaydedilemedi. Tekrar deneyin.", 500);
  }
}
