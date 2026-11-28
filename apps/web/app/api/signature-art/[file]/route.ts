import { artPng } from "@/lib/signature-art";

/** Social icons and the preview logo, e.g. /api/signature-art/linkedin-166b63.png. Public: mail programs load them. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const png = artPng(file);
  if (!png) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(png), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
