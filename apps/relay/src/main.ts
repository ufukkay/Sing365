import { configFromEnv } from "./config";
import { apiSigner, createRelay, mxReturnHost } from "./relay";

const cfg = configFromEnv();
const relay = createRelay(cfg, {
  sign: apiSigner(cfg),
  returnHostFor: mxReturnHost(cfg),
  log: (line) => console.log(JSON.stringify(line)),
});

relay.on("error", (e) => console.error(JSON.stringify({ at: new Date().toISOString(), status: "server_error", error: String(e) })));
relay.listen(cfg.port, () => console.log(`Sing365 relay listening on ${cfg.port} as ${cfg.hostName}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => relay.close(() => process.exit(0)));
