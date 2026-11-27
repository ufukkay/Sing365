// The Sigwide mail relay. Exchange Online's outbound connector hands it each message its
// transport rule selects; the relay adds the sender's signature and hands the message back to
// the same tenant's Exchange Online, which delivers it. Nothing is stored: message bodies only
// pass through memory.
//
// Only Exchange Online may connect, and only messages carrying a valid tenant key (stamped by
// the customer's transport rule) are handed back, so the relay can never be used to inject
// mail into a tenant that did not send it.
import { promises as dns } from "node:dns";
import { BlockList, isIPv4, isIPv6 } from "node:net";
import type { Readable } from "node:stream";
import nodemailer from "nodemailer";
import { SMTPServer, type SMTPServerAddress, type SMTPServerSession } from "smtp-server";
import { inspectMessage, stampMessage, type MessageInfo, type Signature } from "@sing365/stamp";
import type { RelayConfig } from "./config";

export class SmtpError extends Error {
  constructor(
    public responseCode: number,
    message: string,
  ) {
    super(message);
  }
}

interface SignAnswer {
  signature: Signature | null;
  returnDomain: string;
}

export interface RelayDeps {
  /** Asks the web app for the signature. Throws SmtpError(550) for a bad key. */
  sign(info: MessageInfo, recipients: string[]): Promise<SignAnswer>;
  /** Exchange Online host for a tenant domain. */
  returnHostFor(domain: string): Promise<string>;
  log(line: Record<string, unknown>): void;
}

export function allowList(networks: string[]): BlockList {
  const list = new BlockList();
  for (const n of networks) {
    const [addr, bits] = n.split("/");
    const type = isIPv6(addr ?? "") ? "ipv6" : "ipv4";
    list.addSubnet(addr!, Number(bits ?? (type === "ipv6" ? 128 : 32)), type);
  }
  return list;
}

export function allowed(list: BlockList, ip: string): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (v4) return list.check(v4, "ipv4");
  if (isIPv4(ip)) return list.check(ip, "ipv4");
  if (isIPv6(ip)) return list.check(ip, "ipv6");
  return false;
}

/** The web app's /api/relay/sign, with a short memory of keys that worked for when it cannot be reached. */
export function apiSigner(cfg: RelayConfig): RelayDeps["sign"] {
  const goodKeys = new Map<string, { until: number; returnDomain: string }>();
  return async (info, recipients) => {
    if (!info.key) throw new SmtpError(550, "5.7.1 Missing Sigwide key; check the Exchange rule that routes mail to Sigwide");
    let res: Response;
    try {
      res = await fetch(`${cfg.apiUrl}/api/relay/sign`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiSecret}` },
        body: JSON.stringify({ key: info.key, from: info.from, recipients, mode: info.mode, skip: info.skip !== null }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      res = new Response(null, { status: 599 });
    }
    if (res.status === 403) {
      goodKeys.delete(info.key);
      throw new SmtpError(550, "5.7.1 Unknown Sigwide key");
    }
    if (res.ok) {
      const answer = (await res.json()) as SignAnswer;
      goodKeys.set(info.key, { until: Date.now() + cfg.keyGraceMs, returnDomain: answer.returnDomain });
      return answer;
    }
    // Sigwide itself is down: mail from a tenant we recently verified still flows, unsigned.
    const known = goodKeys.get(info.key);
    if (known && known.until > Date.now()) return { signature: null, returnDomain: known.returnDomain };
    throw new SmtpError(451, "4.3.0 Sigwide is temporarily unavailable; please retry");
  };
}

const EXCHANGE_MX = /\.(?:mail\.protection\.outlook\.com|mx\.microsoft)$/i;

/** The tenant domain's MX, which must be Exchange Online. */
export function mxReturnHost(cfg: RelayConfig): RelayDeps["returnHostFor"] {
  return async (domain) => {
    if (cfg.returnHost) return cfg.returnHost;
    const mx = (await dns.resolveMx(domain).catch(() => [])).sort((a, b) => a.priority - b.priority);
    const host = mx.find((r) => EXCHANGE_MX.test(r.exchange))?.exchange;
    if (!host) throw new SmtpError(451, `4.4.4 ${domain} has no Exchange Online MX record; set the return host for this tenant`);
    return host;
  };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const addr = (a: SMTPServerAddress | false) => (a ? a.address : "");

export function createRelay(cfg: RelayConfig, deps: RelayDeps): SMTPServer {
  const networks = allowList(cfg.allowedNetworks);

  async function handle(raw: Buffer, session: SMTPServerSession): Promise<void> {
    const started = Date.now();
    const recipients = session.envelope.rcptTo.map((r) => r.address.toLowerCase());
    const info = await inspectMessage(raw);
    if (info.skip === "already_signed") {
      throw new SmtpError(554, "5.4.6 Message already went through Sigwide: the Exchange rule needs its X-Sigwide-Signed exception");
    }

    const answer = await deps.sign(info, recipients);
    const result = await stampMessage(raw, async () => answer.signature);
    const host = await deps.returnHostFor(answer.returnDomain);

    const transport = nodemailer.createTransport({
      host,
      port: cfg.returnPort,
      secure: false,
      requireTLS: cfg.requireTls,
      ignoreTLS: !cfg.requireTls && !cfg.tls,
      name: cfg.hostName,
      // Exchange Online's inbound connector recognises Sigwide by this certificate.
      tls: cfg.tls ? { key: cfg.tls.key, cert: cfg.tls.cert, servername: host } : undefined,
      connectionTimeout: 30_000,
      socketTimeout: 60_000,
    });
    try {
      await transport.sendMail({ envelope: { from: addr(session.envelope.mailFrom), to: recipients }, raw: result.raw });
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode;
      // Exchange refused the message for good: pass its answer on so the sender gets a bounce.
      if (code && code >= 500) throw new SmtpError(code, `5.0.0 Exchange Online refused the message: ${(e as Error).message}`.slice(0, 400));
      throw new SmtpError(451, "4.4.1 Could not hand the message back to Exchange Online; please retry");
    } finally {
      transport.close();
    }
    deps.log({
      at: new Date().toISOString(),
      status: result.status,
      ...(result.status === "signed" ? { placement: result.placement } : { reason: result.reason }),
      mode: info.mode,
      bytes: raw.length,
      ms: Date.now() - started,
    });
  }

  return new SMTPServer({
    name: cfg.hostName,
    banner: "Sigwide signature relay",
    secure: false,
    ...(cfg.tls ? { key: cfg.tls.key, cert: cfg.tls.cert } : { hideSTARTTLS: true }),
    authOptional: true,
    disabledCommands: ["AUTH"],
    size: cfg.maxSize,
    logger: false,
    onConnect(session, callback) {
      if (!allowed(networks, session.remoteAddress)) {
        deps.log({ at: new Date().toISOString(), status: "refused_connection", remote: session.remoteAddress });
        return callback(new SmtpError(554, "5.7.1 Only Exchange Online may use this relay"));
      }
      callback();
    },
    onData(stream, session, callback) {
      readAll(stream)
        .then((raw) => {
          if ((stream as Readable & { sizeExceeded?: boolean }).sizeExceeded) throw new SmtpError(552, "5.3.4 Message too big");
          return handle(raw, session);
        })
        .then(
          () => callback(),
          (e: unknown) => {
            const err = e instanceof SmtpError ? e : new SmtpError(451, "4.3.0 Sigwide could not process the message; please retry");
            if (!(e instanceof SmtpError)) deps.log({ at: new Date().toISOString(), status: "error", error: String(e) });
            else deps.log({ at: new Date().toISOString(), status: "rejected", code: err.responseCode, error: err.message });
            callback(err);
          },
        );
    },
  });
}
