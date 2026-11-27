/** Server-only configuration. Values come from env vars (see .env.example). */
export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  publicUrl: (process.env.SING365_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  entraClientId: process.env.ENTRA_CLIENT_ID ?? "",
  entraClientSecret: process.env.ENTRA_CLIENT_SECRET ?? "",
  /** api://... Application ID URI used by the add-in's SSO token (optional until "Expose an API" is set). */
  entraApiAudience: process.env.ENTRA_API_AUDIENCE ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  /** Shared secret the Sigwide mail relay sends to /api/relay/sign (server-side signatures). */
  relaySecret: process.env.RELAY_SECRET ?? "",
  devAuth: process.env.SING365_DEV_AUTH === "1" && process.env.NODE_ENV !== "production",
};

/** Names (never values) of the sign-in settings that are missing or too short. */
export function missingEntraSettings(): string[] {
  const missing: string[] = [];
  if (!env.entraClientId) missing.push("ENTRA_CLIENT_ID");
  if (!env.entraClientSecret) missing.push("ENTRA_CLIENT_SECRET");
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  else if (env.sessionSecret.length < 32) missing.push("SESSION_SECRET (en az 32 karakter olmalı)");
  return missing;
}

export const entraConfigured = () => Boolean(env.entraClientId && env.entraClientSecret && env.sessionSecret.length >= 32);
export const dbConfigured = () => Boolean(env.databaseUrl);
export const authority = "https://login.microsoftonline.com";
