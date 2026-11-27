import { configFromEnv, readTls, tlsFilesFromEnv, tlsFilesReady } from "./config";
import { apiSigner, createRelay, mxReturnHost } from "./relay";

const log = (line: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...line }));

// On a fresh server the HTTPS proxy fetches the certificate a little after everything starts: wait for it.
const files = tlsFilesFromEnv();
if (files) {
  while (!tlsFilesReady(files)) {
    log({ status: "waiting_for_certificate", certFile: files.certFile });
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const cfg = configFromEnv();
const relay = createRelay(cfg, {
  sign: apiSigner(cfg),
  returnHostFor: mxReturnHost(cfg),
  log: (line) => console.log(JSON.stringify(line)),
});

relay.on("error", (e) => log({ status: "server_error", error: String(e) }));
relay.listen(cfg.port, () => log({ status: "listening", port: cfg.port, host: cfg.hostName }));

// The certificate is renewed every couple of months: pick up the new one without a restart.
if (files) {
  setInterval(() => {
    try {
      const next = readTls(files);
      if (cfg.tls && next.cert.equals(cfg.tls.cert) && next.key.equals(cfg.tls.key)) return;
      cfg.tls = next;
      relay.updateSecureContext({ key: next.key, cert: next.cert });
      log({ status: "certificate_reloaded" });
    } catch (e) {
      log({ status: "certificate_reload_failed", error: String(e) });
    }
  }, 60 * 60 * 1000).unref();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => relay.close(() => process.exit(0)));
