// Builds dist/manifest.xml from manifest.template.xml.
//   SING365_PUBLIC_URL=https://app.example.com SING365_ADDIN_ID=<guid> node scripts/build-manifest.mjs
//   node scripts/build-manifest.mjs --check   (validates the template with placeholder values)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const check = process.argv.includes("--check");

const base = (process.env.SING365_PUBLIC_URL ?? (check ? "https://localhost:3000" : "")).replace(/\/$/, "");
const id = process.env.SING365_ADDIN_ID ?? (check ? "00000000-0000-4000-8000-000000000000" : "");
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (m) => { console.error(m); process.exit(1); };
if (!/^https:\/\//.test(base)) fail("SING365_PUBLIC_URL must be an https:// URL (Office requires HTTPS).");
if (!GUID.test(id)) fail("SING365_ADDIN_ID must be a GUID. Generate one once and keep it.");

// Office SSO: needs ENTRA_CLIENT_ID and, in Entra, "Expose an API" with Application ID URI api://<host>/<client id>.
const clientId = process.env.ENTRA_CLIENT_ID ?? (check ? "00000000-0000-4000-8000-000000000001" : "");
if (clientId && !GUID.test(clientId)) fail("ENTRA_CLIENT_ID must be a GUID.");
const host = new URL(base).host;
const webAppInfo = clientId
  ? `<WebApplicationInfo>
        <Id>${clientId}</Id>
        <Resource>api://${host}/${clientId}</Resource>
        <Scopes>
          <Scope>openid</Scope>
          <Scope>profile</Scope>
        </Scopes>
      </WebApplicationInfo>`
  : "";

const xml = readFileSync(join(root, "manifest.template.xml"), "utf8")
  .replaceAll("{{WEB_APP_INFO}}", webAppInfo)
  .replaceAll("{{BASE_URL}}", base)
  .replaceAll("{{APP_ID}}", id);

const left = xml.match(/\{\{[A-Z_]+\}\}/g);
if (left) fail(`Unfilled placeholders: ${[...new Set(left)].join(", ")}`);
const open = (xml.match(/<[A-Za-z][^>]*[^/]>/g) ?? []).filter((t) => !t.startsWith("<?")).length;
const close = (xml.match(/<\/[^>]+>/g) ?? []).length;
if (open !== close) fail(`Unbalanced tags: ${open} open, ${close} close.`);
for (const fn of ["onNewMessageComposeHandler", "onMessageRecipientsChangedHandler", "onMessageFromChangedHandler"]) {
  if (!xml.includes(`FunctionName="${fn}"`)) fail(`Missing launch event handler ${fn}`);
}

if (check) { console.log("manifest template OK"); process.exit(0); }
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "manifest.xml"), xml);
console.log(`Wrote dist/manifest.xml for ${base}`);
