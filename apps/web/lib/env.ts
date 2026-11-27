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
  devAuth: process.env.SING365_DEV_AUTH === "1" && process.env.NODE_ENV !== "production",
};

export const entraConfigured = () => Boolean(env.entraClientId && env.entraClientSecret && env.sessionSecret.length >= 32);
export const dbConfigured = () => Boolean(env.databaseUrl);
export const authority = "https://login.microsoftonline.com";
