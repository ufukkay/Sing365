import { getDb } from "@/lib/data";
import { isLocalAssetDemoMode, readLocalSignatureAsset, readSignatureAsset, SIGNATURE_ASSET_ID } from "@/lib/signature-assets";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SIGNATURE_ASSET_ID.test(id)) return new Response(null, { status: 404 });
  const db = getDb();
  const demoMode = isLocalAssetDemoMode(db);
  if (!db && !demoMode) return new Response(null, { status: 404 });

  try {
    const asset = demoMode ? readLocalSignatureAsset(id) : await readSignatureAsset(db!, id);
    if (!asset) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(asset.signature_content), {
      headers: {
        "Cache-Control": demoMode ? "no-store" : "public, max-age=31536000, immutable",
        "Content-Type": asset.content_type,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
