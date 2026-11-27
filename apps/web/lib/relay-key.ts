import { createHash, randomBytes } from "node:crypto";

/** A relay key: 32 random bytes, URL-safe. The customer's Exchange rule stamps it on every message it routes to Sigwide. */
export function newRelayKey(): string {
  return `sgw_${randomBytes(32).toString("base64url")}`;
}

/** Only this hash is stored; the key itself is shown to the admin once. */
export function relayKeyHash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}
