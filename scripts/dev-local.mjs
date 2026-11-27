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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.SING365_LOCAL_DB_DIR ?? join(root, ".local-db");
const isWindows = process.platform === "win32";
// Windows refuses to run postgres.exe directly for a user with admin rights (most company laptops);
// pg_ctl drops those rights before starting it. SING365_LOCAL_DB_PGCTL=1 forces this path elsewhere for testing.
const usePgCtl = isWindows || process.env.SING365_LOCAL_DB_PGCTL === "1";
const serverLog = join(dataDir, "server.log");
// The port the running server uses, so a server left running by a closed window can be reused.
const portFile = join(dataDir, "sing365.port");
// Windows (Hyper-V, WSL, Docker) reserves random blocks of ports, mostly above 49152, and refuses to bind
// them with "Permission denied". Try a few ports below that range, in order.
const PORTS = process.env.SING365_LOCAL_DB_PORT ? [Number(process.env.SING365_LOCAL_DB_PORT)] : [15432, 25432, 35432, 45432];

const DB = "sing365";
// The app connects as a normal (non-superuser) owner, like on Neon, so row-level security applies.
const APP_ROLE = "sing365_app";
const APP_PASSWORD = "sing365-local";
const appUrl = (port) => `postgresql://${APP_ROLE}:${APP_PASSWORD}@localhost:${port}/${DB}`;

const say = (msg) => console.log(`[yerel-db] ${msg}`);

// Postgres' own messages are hidden unless something fails; then the last ones are shown.
const pgLog = [];
const remember = (chunk) => {
  for (const line of String(chunk ?? "").split(/\r?\n/)) if (line.trim()) pgLog.push(line.trim());
  pgLog.splice(0, Math.max(0, pgLog.length - 30));
};
const showPgLog = () => {
  if (pgLog.length === 0) return;
  console.error("[yerel-db] PostgreSQL'in son mesajları:");
  for (const line of pgLog) console.error(`  ${line}`);
};
const portRefused = () => pgLog.some((l) => /could not (bind|create any TCP\/IP sockets)|Address already in use/i.test(l));

function makePg(port) {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "sing365-local-admin",
    port,
    persistent: true,
    // Reachable from this computer only.
    postgresFlags: ["-c", "listen_addresses=localhost"],
    // UTF-8 with Unicode-aware lower()/upper() whatever the computer's language (Windows would pick WIN1254 on Turkish).
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--locale-provider=builtin", "--builtin-locale=C.UTF-8"],
    // initdb refuses to run as root (CI containers); harmless elsewhere.
    createPostgresUser: typeof process.getuid === "function" && process.getuid() === 0,
    onLog: remember,
    onError: remember,
  });
}
let pg = makePg(PORTS[0]);

function run(cmd, args, env, { detached = false } = {}) {
  return spawn(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env }, detached });
}

/** Runs pnpm without a shell: through the pnpm that started this script when there is one. */
function runPnpm(args, env, opts) {
  const pnpm = process.env.npm_execpath;
  if (pnpm && /\.c?js$/i.test(pnpm)) return run(process.execPath, [pnpm, ...args], env, opts);
  if (pnpm && /pnpm(\.exe)?$/i.test(pnpm)) return run(pnpm, args, env, opts);
  return spawn(isWindows ? "pnpm.cmd" : "pnpm", args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env }, shell: isWindows, ...opts });
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

// Modules embedded-postgres depends on, resolved from its own folder (pnpm keeps them out of the root).
const fromEmbedded = createRequire(createRequire(import.meta.url).resolve("embedded-postgres"));
// Exiting through exit-hook (which embedded-postgres registers with) avoids its "synchronous termination" warning.
const { gracefulExit } = await import(pathToFileURL(fromEmbedded.resolve("exit-hook")).href);

/** pg_ctl from the same binaries package embedded-postgres uses. */
async function pgCtlPath() {
  const os = isWindows ? "windows" : process.platform;
  const mod = await import(pathToFileURL(fromEmbedded.resolve(`@embedded-postgres/${os}-${process.arch}`)).href);
  return mod.pg_ctl;
}

// "start" leaves postgres running; if it inherited our pipes, waiting for pg_ctl could hang on Windows,
// so its output is not captured (it goes to server.log instead).
function pgCtl(bin, args, { capture = true } = {}) {
  return spawnSync(bin, args, { encoding: "utf8", windowsHide: true, stdio: capture ? "pipe" : "ignore" });
}

function rememberServerLog() {
  try {
    remember(readFileSync(serverLog, "utf8").split(/\r?\n/).slice(-30).join("\n"));
  } catch {
    // no log yet
  }
}

/** Starts the server on `port`; resolves false when that port is refused so the next one can be tried. */
async function startOn(port) {
  pgLog.length = 0;
  if (!usePgCtl) {
    pg = makePg(port);
    try {
      await pg.start();
      return true;
    } catch {
      if (portRefused()) return false;
      throw new Error("start failed");
    }
  }
  const bin = await pgCtlPath();
  rmSync(serverLog, { force: true });
  const r = pgCtl(bin, ["start", "-D", dataDir, "-w", "-t", "60", "-l", serverLog, "-o", `-p ${port} -c listen_addresses=localhost`], {
    capture: false,
  });
  if (r.status === 0) return true;
  if (r.error) remember(r.error.message);
  rememberServerLog();
  if (portRefused()) return false;
  throw new Error("pg_ctl start failed");
}

/** Returns the port the server is listening on. */
async function startServer() {
  if (usePgCtl && existsSync(portFile)) {
    // Still running from an earlier window that was closed without Ctrl+C: reuse it.
    const running = pgCtl(await pgCtlPath(), ["status", "-D", dataDir]).status === 0;
    const port = Number(readFileSync(portFile, "utf8").trim());
    if (running && port) {
      pg = makePg(port);
      return port;
    }
  }
  for (const port of PORTS) {
    if (await startOn(port)) {
      writeFileSync(portFile, String(port));
      pg = makePg(port);
      return port;
    }
    say(`${port} numaralı port kullanılamıyor, başka bir port deneniyor...`);
  }
  throw new Error("no port");
}

async function stopServer() {
  if (!usePgCtl) return pg.stop();
  pgCtl(await pgCtlPath(), ["stop", "-D", dataDir, "-m", "fast", "-w"]);
}

/** Returns the DATABASE_URL for the app. */
async function prepare() {
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    say("İlk çalıştırma: veritabanı oluşturuluyor (birkaç saniye)...");
    try {
      await pg.initialise();
    } catch (e) {
      showPgLog();
      throw new Error(`Veritabanı oluşturulamadı: ${e instanceof Error ? e.message : e}`);
    }
  }
  let port;
  try {
    port = await startServer();
  } catch {
    showPgLog();
    throw new Error(
      `Veritabanı başlatılamadı. Olası sebepler: (1) portlar (${PORTS.join(", ")}) başka programlarda, örneğin açık kalmış ` +
        `başka bir "pnpm dev:local" penceresi; (2) yarım kalmış bir ilk kurulum. İkincisi için .local-db klasörünü silip tekrar deneyin ` +
        `(Windows: rmdir /s /q .local-db). Bu, yerel test verisini sıfırlar.`,
    );
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
      DATABASE_URL: appUrl(port),
    }).on("exit", resolve);
  });
  if (code !== 0) throw new Error("Tablolar hazırlanamadı (migrate).");
  return appUrl(port);
}

let stopping = false;
let web = null;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  killTree(web);
  say("Veritabanı kapatılıyor...");
  try {
    await stopServer();
  } catch {
    // already stopped
  }
  gracefulExit(code);
}

async function main() {
  let databaseUrl;
  try {
    databaseUrl = await prepare();
  } catch (e) {
    console.error(`[yerel-db] ${e instanceof Error ? e.message : e}`);
    await stop(1);
    return;
  }

  say(`Hazır. Uygulama başlatılıyor: ${process.env.SING365_PUBLIC_URL ?? "http://localhost:3000"}`);
  // Environment variables set here win over apps/web/.env.local, so its DATABASE_URL line can stay empty.
  // On macOS/Linux the app gets its own process group so stop() can end all of it at once.
  web = runPnpm(["--filter", "@sing365/web", "dev"], { DATABASE_URL: databaseUrl }, { detached: !isWindows });
  web.on("error", (e) => {
    console.error(`[yerel-db] Uygulama başlatılamadı: ${e.message}`);
    stop(1);
  });
  web.on("exit", (code) => stop(code ?? 0));
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => stop(0));
await main();
