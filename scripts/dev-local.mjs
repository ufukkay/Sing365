// Local development with a real PostgreSQL that lives inside this repo: no install, no account.
//
//   pnpm dev:local
//
// First run creates the database in .local-db/ (gitignored), then every run starts it,
// applies any new migrations and starts the web app with DATABASE_URL pointing at it.
// Ctrl+C stops both. Delete .local-db/ to start from an empty database.
//
// The database listens on localhost only and uses fixed local passwords; it is for
// development on one machine, never for production.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, ".local-db");
const port = Number(process.env.SING365_LOCAL_DB_PORT ?? 54329);
const isWindows = process.platform === "win32";

const DB = "sing365";
// The app connects as a normal (non-superuser) owner, like on Neon, so row-level security applies.
const APP_ROLE = "sing365_app";
const APP_PASSWORD = "sing365-local";
const appUrl = `postgresql://${APP_ROLE}:${APP_PASSWORD}@localhost:${port}/${DB}`;

const say = (msg) => console.log(`[yerel-db] ${msg}`);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "sing365-local-admin",
  port,
  persistent: true,
  // Reachable from this computer only.
  postgresFlags: ["-c", "listen_addresses=localhost"],
  // initdb refuses to run as root (CI containers); harmless elsewhere.
  createPostgresUser: typeof process.getuid === "function" && process.getuid() === 0,
  onLog: () => {},
  onError: (e) => {
    const text = String(e ?? "").trim();
    if (text) console.error(`[yerel-db] ${text}`);
  },
});

// shell is only needed for pnpm on Windows (pnpm.cmd); node's own path may contain spaces.
function run(cmd, args, env, { shell = false, detached = false } = {}) {
  return spawn(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env }, shell, detached });
}

/** Stops the web app and everything it started (pnpm -> next dev -> next-server). */
function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

async function prepare() {
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    say("İlk çalıştırma: veritabanı oluşturuluyor (birkaç saniye)...");
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (e) {
    console.error(
      `[yerel-db] Veritabanı başlatılamadı. ${port} numaralı port başka bir program tarafından kullanılıyor olabilir ` +
        `(örneğin açık kalmış başka bir "pnpm dev:local" penceresi). O pencereyi kapatıp tekrar deneyin.`,
    );
    throw e;
  }

  const admin = pg.getPgClient("postgres");
  await admin.connect();
  try {
    const role = await admin.query("select 1 from pg_roles where rolname = $1", [APP_ROLE]);
    if (role.rowCount === 0) {
      await admin.query(`create role ${APP_ROLE} login password '${APP_PASSWORD}' nosuperuser nobypassrls`);
    }
    const db = await admin.query("select 1 from pg_database where datname = $1", [DB]);
    if (db.rowCount === 0) await admin.query(`create database ${DB} owner ${APP_ROLE}`);
  } finally {
    await admin.end();
  }

  say("Tablolar güncelleniyor...");
  const code = await new Promise((resolve) => {
    run(process.execPath, ["--experimental-strip-types", "--no-warnings", "packages/db/scripts/migrate.ts"], {
      DATABASE_URL: appUrl,
    }).on("exit", resolve);
  });
  if (code !== 0) throw new Error("Tablolar hazırlanamadı (migrate).");
}

let stopping = false;
let web = null;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  killTree(web);
  say("Veritabanı kapatılıyor...");
  try {
    await pg.stop();
  } catch {
    // already stopped
  }
  process.exit(code);
}

try {
  await prepare();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  await stop(1);
}

say(`Hazır. Uygulama başlatılıyor: ${process.env.SING365_PUBLIC_URL ?? "http://localhost:3000"}`);
// Environment variables set here win over apps/web/.env.local, so its DATABASE_URL line can stay empty.
// On macOS/Linux the app gets its own process group so stop() can end all of it at once.
web = run("pnpm", ["--filter", "@sing365/web", "dev"], { DATABASE_URL: appUrl }, { shell: isWindows, detached: !isWindows });
web.on("exit", (code) => stop(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => stop(0));
