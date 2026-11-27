import type { AddressInfo } from "node:net";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { SMTPServer } from "smtp-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RelayConfig } from "../src/config";
import { allowed, allowList, apiSigner, createRelay, SmtpError } from "../src/relay";

// A fake Exchange Online that receives what the relay hands back.
const received: { from: string; to: string[]; raw: Buffer }[] = [];
let exchangeUp = true;
const exchange = new SMTPServer({
  authOptional: true,
  hideSTARTTLS: true,
  logger: false,
  onData(stream, session, cb) {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      if (!exchangeUp) return cb(Object.assign(new Error("try later"), { responseCode: 421 }));
      received.push({
        from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
        to: session.envelope.rcptTo.map((r) => r.address),
        raw: Buffer.concat(chunks),
      });
      cb();
    });
  },
});

// A fake Sing365 web app.
let apiUp = true;
const apiCalls: unknown[] = [];
const realFetch = globalThis.fetch;

function config(over: Partial<RelayConfig> = {}): RelayConfig {
  return {
    port: 0,
    hostName: "relay.test",
    tls: null,
    allowedNetworks: ["127.0.0.0/8", "::1/128"],
    apiUrl: "http://sing365.test",
    apiSecret: "relay-secret",
    returnHost: "127.0.0.1",
    returnPort: (exchange.server.address() as AddressInfo).port,
    requireTls: false,
    maxSize: 1024 * 1024,
    keyGraceMs: 60_000,
    ...over,
  };
}

const relays: SMTPServer[] = [];
const logs: Record<string, unknown>[] = [];
async function startRelay(cfg: RelayConfig): Promise<number> {
  const relay = createRelay(cfg, { sign: apiSigner(cfg), returnHostFor: async () => cfg.returnHost!, log: (l) => logs.push(l) });
  relays.push(relay);
  await new Promise<void>((r) => relay.listen(0, "127.0.0.1", r));
  return (relay.server.address() as AddressInfo).port;
}

function mail(extraHeaders: string[], body = "Merhaba,\r\nTeklif ektedir.\r\n"): Buffer {
  return Buffer.from(
    [
      "From: Ufuk KAYA <ufuk.kaya@talay.com>",
      "To: musteri@baskafirma.com",
      "Subject: Teklif",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      ...extraHeaders,
      "",
      body,
    ].join("\r\n"),
  );
}

async function send(port: number, raw: Buffer) {
  const t = nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true });
  try {
    return await t.sendMail({ envelope: { from: "ufuk.kaya@talay.com", to: ["musteri@baskafirma.com", "ali@talay.com"] }, raw });
  } finally {
    t.close();
  }
}

beforeAll(async () => {
  await new Promise<void>((r) => exchange.listen(0, "127.0.0.1", r));
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (!String(url).startsWith("http://sing365.test/")) return realFetch(url, init);
    if (!apiUp) throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body));
    apiCalls.push({ auth: (init?.headers as Record<string, string>).authorization, ...body });
    if (body.key !== "good-key") return Response.json({ error: "bad_key" }, { status: 403 });
    return Response.json({
      signature: body.skip ? null : { html: "<b>Ufuk KAYA</b>", text: "Ufuk KAYA\nKıdemli Uzman" },
      returnDomain: "talay.com",
    });
  }) as typeof fetch;
});

afterEach(() => {
  received.length = 0;
  apiCalls.length = 0;
  logs.length = 0;
  apiUp = true;
  exchangeUp = true;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const r of relays) await new Promise<void>((res) => r.close(() => res()));
  await new Promise<void>((r) => exchange.close(() => r()));
});

describe("relay", () => {
  it("signs the message and hands it back to Exchange with the same envelope", async () => {
    const port = await startRelay(config());
    await send(port, mail(["X-Sing365-Key: good-key"]));

    expect(apiCalls).toEqual([
      {
        auth: "Bearer relay-secret",
        key: "good-key",
        from: "ufuk.kaya@talay.com",
        recipients: ["musteri@baskafirma.com", "ali@talay.com"],
        mode: "new",
        skip: false,
      },
    ]);
    expect(received).toHaveLength(1);
    expect(received[0]!.from).toBe("ufuk.kaya@talay.com");
    expect(received[0]!.to).toEqual(["musteri@baskafirma.com", "ali@talay.com"]);
    const m = await simpleParser(received[0]!.raw);
    expect(m.text).toBe("Merhaba,\nTeklif ektedir.\n\nUfuk KAYA\nKıdemli Uzman\n");
    expect(m.headers.get("x-sing365-signed")).toBe("1");
    expect(m.headers.has("x-sing365-key")).toBe(false);
    expect(logs).toEqual([expect.objectContaining({ status: "signed", placement: "text-only", mode: "new" })]);
    // No addresses in the log.
    expect(JSON.stringify(logs)).not.toMatch(/@/);
  });

  it("refuses messages without a key or with an unknown key, so it can never relay for strangers", async () => {
    const port = await startRelay(config());
    await expect(send(port, mail([]))).rejects.toMatchObject({ responseCode: 550 });
    await expect(send(port, mail(["X-Sing365-Key: wrong"]))).rejects.toMatchObject({ responseCode: 550 });
    expect(received).toHaveLength(0);
  });

  it("refuses connections from outside Exchange Online", async () => {
    const port = await startRelay(config({ allowedNetworks: ["10.0.0.0/8"] }));
    await expect(send(port, mail(["X-Sing365-Key: good-key"]))).rejects.toMatchObject({ responseCode: 554 });
    expect(received).toHaveLength(0);
  });

  it("refuses a message that already went through Sing365 (a loop in the Exchange rule)", async () => {
    const port = await startRelay(config());
    await expect(send(port, mail(["X-Sing365-Key: good-key", "X-Sing365-Signed: 1"]))).rejects.toMatchObject({ responseCode: 554 });
  });

  it("passes S/MIME and meeting invites through unchanged but marked", async () => {
    const port = await startRelay(config());
    const raw = Buffer.from(
      [
        "From: ufuk.kaya@talay.com",
        "Subject: Toplanti",
        "MIME-Version: 1.0",
        "X-Sing365-Key: good-key",
        'Content-Type: multipart/alternative; boundary="c"',
        "",
        "--c\r\nContent-Type: text/plain\r\n\r\nDavet\r\n--c\r\nContent-Type: text/calendar; method=REQUEST\r\n\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n--c--\r\n",
      ].join("\r\n"),
    );
    await send(port, raw);
    expect(apiCalls).toEqual([expect.objectContaining({ skip: true })]);
    expect(received[0]!.raw.toString()).toContain("X-Sing365-Signed: skipped; calendar");
    expect(received[0]!.raw.toString()).toContain("--c\r\nContent-Type: text/plain\r\n\r\nDavet\r\n");
  });

  it("asks Exchange to retry when Sing365 is down, unless the key worked recently (then it delivers unsigned)", async () => {
    const port = await startRelay(config());
    apiUp = false;
    await expect(send(port, mail(["X-Sing365-Key: good-key"]))).rejects.toMatchObject({ responseCode: 451 });

    apiUp = true;
    await send(port, mail(["X-Sing365-Key: good-key"]));
    apiUp = false;
    await send(port, mail(["X-Sing365-Key: good-key"]));
    expect(received).toHaveLength(2);
    expect(received[1]!.raw.toString()).toContain("X-Sing365-Signed: skipped; no_signature");
  });

  it("asks Exchange to retry when the message cannot be handed back", async () => {
    const port = await startRelay(config());
    exchangeUp = false;
    await expect(send(port, mail(["X-Sing365-Key: good-key"]))).rejects.toMatchObject({ responseCode: 451 });
  });
});

describe("network allow-list", () => {
  it("matches IPv4, IPv4-mapped IPv6 and IPv6 ranges", () => {
    const list = allowList(["40.92.0.0/15", "2a01:111:f400::/48"]);
    expect(allowed(list, "40.93.1.2")).toBe(true);
    expect(allowed(list, "::ffff:40.92.0.9")).toBe(true);
    expect(allowed(list, "40.94.0.1")).toBe(false);
    expect(allowed(list, "2a01:111:f400:7e00::1")).toBe(true);
    expect(allowed(list, "2a01:111:f401::1")).toBe(false);
    expect(allowed(list, "not-an-ip")).toBe(false);
  });

  it("names the error type", () => {
    expect(new SmtpError(451, "x").responseCode).toBe(451);
  });
});
