import { readFileSync } from "node:fs";

export interface RelayConfig {
  /** Port Exchange Online connects to. 25 in production. */
  port: number;
  /** Host name in the SMTP greeting; the outbound connector's smart host. */
  hostName: string;
  /** TLS certificate for STARTTLS (and presented to Exchange when the message goes back). */
  tls: { key: Buffer; cert: Buffer } | null;
  /** Networks allowed to connect (CIDR). Defaults to Exchange Online's published sending ranges. */
  allowedNetworks: string[];
  /** Base URL of the Sing365 web app, e.g. http://localhost:3000. */
  apiUrl: string;
  /** Same value as RELAY_SECRET in the web app. */
  apiSecret: string;
  /** Where messages go back. Unset in production: the tenant domain's MX (Exchange Online). */
  returnHost: string | null;
  returnPort: number;
  /** Require STARTTLS when handing messages back (always in production). */
  requireTls: boolean;
  /** Largest message accepted, in bytes (Exchange Online's own limit is 150 MB). */
  maxSize: number;
  /** How long a key that worked stays trusted when the web app cannot be reached, in ms. */
  keyGraceMs: number;
}

/**
 * Exchange Online Protection's sending ranges (Microsoft 365 endpoint ID 9, "*.mail.protection.outlook.com").
 * Check against https://endpoints.office.com when deploying; override with RELAY_ALLOWED_NETWORKS.
 */
export const EXCHANGE_ONLINE_NETWORKS = [
  "40.92.0.0/15",
  "40.107.0.0/16",
  "52.100.0.0/14",
  "52.238.78.88/32",
  "104.47.0.0/17",
  "2a01:111:f400::/48",
  "2a01:111:f403::/48",
];

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const production = env.NODE_ENV === "production";
  const keyFile = env.RELAY_TLS_KEY_FILE;
  const certFile = env.RELAY_TLS_CERT_FILE;
  const tls = keyFile && certFile ? { key: readFileSync(keyFile), cert: readFileSync(certFile) } : null;
  const cfg: RelayConfig = {
    port: Number(env.RELAY_PORT ?? (production ? 25 : 2525)),
    hostName: env.RELAY_HOSTNAME ?? "localhost",
    tls,
    allowedNetworks: list(env.RELAY_ALLOWED_NETWORKS).length > 0 ? list(env.RELAY_ALLOWED_NETWORKS) : EXCHANGE_ONLINE_NETWORKS,
    apiUrl: (env.SING365_API_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    apiSecret: env.RELAY_SECRET ?? "",
    returnHost: env.RELAY_RETURN_HOST || null,
    returnPort: Number(env.RELAY_RETURN_PORT ?? 25),
    requireTls: production || env.RELAY_REQUIRE_TLS === "1",
    maxSize: Number(env.RELAY_MAX_SIZE ?? 150 * 1024 * 1024),
    keyGraceMs: Number(env.RELAY_KEY_GRACE_MS ?? 24 * 60 * 60 * 1000),
  };
  const problems: string[] = [];
  if (!cfg.apiSecret) problems.push("RELAY_SECRET");
  if (production && !cfg.tls) problems.push("RELAY_TLS_KEY_FILE / RELAY_TLS_CERT_FILE");
  if (production && cfg.hostName === "localhost") problems.push("RELAY_HOSTNAME");
  if (problems.length > 0) throw new Error(`Missing relay settings: ${problems.join(", ")}`);
  return cfg;
}
