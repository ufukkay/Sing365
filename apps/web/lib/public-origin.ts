// No server-only import: shared by the server actions and the quick-signature rebuild.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The panel's public origin for images in signatures (https; plain http only on a local dev machine). */
export function publicAssetOrigin(): string | null {
  try {
    const url = new URL((process.env.SING365_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "") + "/");
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
