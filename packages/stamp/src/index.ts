/// <reference path="./vendor.d.ts" />
// Adds a signature to a raw outgoing email (RFC 5322 / MIME) without touching anything else:
// only the message's own text/html and text/plain bodies change; attachments, embedded
// messages and every other byte are passed through as they were.
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import iconv from "iconv-lite";
import * as libbase64 from "libbase64";
import libmime from "libmime";
import * as libqp from "libqp";
import { Splitter, type MimeNode, type SplitItem } from "mailsplit";
import { insertHtmlSignature, textToHtml, type Placement } from "./html";
import { insertTextSignature, unflow } from "./text";

export { insertHtmlSignature, replyMarker, textToHtml } from "./html";
export { insertTextSignature, unflow } from "./text";

/** Header Sigwide puts on every message it has handled; the Exchange rule skips messages that carry it. */
export const SIGNED_HEADER = "X-Sigwide-Signed";
/** Header the customer's Exchange rule sets with the tenant's relay key; removed before the message leaves. */
export const KEY_HEADER = "X-Sigwide-Key";

export type Mode = "new" | "reply";

export interface MessageInfo {
  /** The From address, lower-cased ("" if missing). */
  from: string;
  mode: Mode;
  subject: string;
  /** Value of the X-Sigwide-Key header, if any. */
  key: string | null;
  /** Why this message must not be changed, or null. */
  skip: SkipReason | null;
}

export type SkipReason = "already_signed" | "smime" | "calendar" | "report" | "auto_submitted" | "no_body";

export interface Signature {
  html: string;
  text: string;
}

export type StampResult =
  | { status: "signed"; raw: Buffer; info: MessageInfo; placement: Placement | "text-only" | "converted-to-html" }
  | { status: "skipped"; raw: Buffer; info: MessageInfo; reason: SkipReason | "no_signature" };

// Reply/forward prefixes, matched on the Turkish lower-case subject (YNT = yanıt, İLT = ilet).
const REPLY_SUBJECT = /^\s*(?:re|fw|fwd|aw|wg|ynt|ilt|ılt|cvp)\s*:/;
const SMIME = new Set(["multipart/signed", "multipart/encrypted", "application/pkcs7-mime", "application/x-pkcs7-mime"]);

async function split(raw: Buffer): Promise<SplitItem[]> {
  const items: SplitItem[] = [];
  const splitter = new Splitter();
  splitter.on("data", (d: SplitItem) => items.push(d));
  await new Promise<void>((resolve, reject) => {
    splitter.on("end", resolve);
    splitter.on("error", reject);
    Readable.from([raw]).pipe(splitter);
  });
  return items;
}

function join(items: SplitItem[]): Buffer {
  return Buffer.concat(items.map((i) => (i.type === "node" ? i.getHeaders() : i.value)));
}

function insideEmbeddedMessage(node: MimeNode): boolean {
  for (let p = node.parentNode; p; p = p.parentNode) if (p.contentType === "message/rfc822") return true;
  return false;
}

function addressOf(header: string): string {
  const decoded = libmime.decodeWords(header);
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(decoded);
  const bare = /([^\s<>"',;:]+@[^\s<>"',;:]+)/.exec(decoded);
  return (angle?.[1] ?? bare?.[1] ?? "").toLowerCase();
}

function describe(items: SplitItem[]): { info: MessageInfo; html: MimeNode | null; text: MimeNode | null } {
  const nodes = items.filter((i): i is MimeNode => i.type === "node");
  const root = nodes[0];
  const h = root?.headers;
  const first = (k: string) => (h?.hasHeader(k) ? h.getFirst(k) : "");
  const subject = libmime.decodeWords(first("Subject"));
  const replying = Boolean(first("In-Reply-To") || first("References")) || REPLY_SUBJECT.test(subject.toLocaleLowerCase("tr-TR"));
  const auto = first("Auto-Submitted").trim().toLowerCase();

  let html: MimeNode | null = null;
  let text: MimeNode | null = null;
  let calendar = false;
  for (const n of nodes) {
    if (n.multipart || insideEmbeddedMessage(n)) continue;
    if (n.contentType === "text/calendar") calendar = true;
    if (n.disposition === "attachment") continue;
    if (n.contentType === "text/html" && !html) html = n;
    else if ((n.contentType === "text/plain" || n.contentType === false) && !text) text = n;
  }

  let skip: SkipReason | null = null;
  if (h?.hasHeader(SIGNED_HEADER)) skip = "already_signed";
  else if (root && SMIME.has(String(root.contentType))) skip = "smime";
  else if (root?.contentType === "multipart/report") skip = "report";
  else if (calendar) skip = "calendar";
  else if (auto && auto !== "no") skip = "auto_submitted";
  else if (!html && !text) skip = "no_body";

  return {
    info: { from: addressOf(first("From")), mode: replying ? "reply" : "new", subject, key: first(KEY_HEADER).trim() || null, skip },
    html,
    text,
  };
}

function bodyOf(items: SplitItem[], node: MimeNode): string {
  const raw = Buffer.concat(items.filter((i): i is Extract<SplitItem, { type: "body" }> => i.type === "body" && i.node === node).map((i) => i.value));
  const ascii = raw.toString("binary");
  const bytes = node.encoding === "base64" ? libbase64.decode(ascii) : node.encoding === "quoted-printable" ? libqp.decode(ascii) : raw;
  const charset = String(node.charset || "utf-8");
  return iconv.encodingExists(charset) ? iconv.decode(bytes, charset) : bytes.toString("utf8");
}

const qpEncode = (content: string) => libqp.wrap(libqp.encode(Buffer.from(content, "utf8")), 76).replace(/\r?\n/g, "\r\n");

/** Puts `value` in place of a node's body. */
function setBody(items: SplitItem[], node: MimeNode, value: Buffer): SplitItem[] {
  // The line break before the next boundary belongs to the multipart structure, not to the body.
  const body: SplitItem = { type: "body", node, value };
  const out: SplitItem[] = [];
  let done = false;
  for (const i of items) {
    if (i.type === "body" && i.node === node) {
      if (!done) out.push(body);
      done = true;
    } else out.push(i);
  }
  // A node with an empty body has no body items: put the new one right after its headers.
  if (!done) out.splice(out.indexOf(node) + 1, 0, body);
  return out;
}

/** Replaces a leaf node's body with `content`, re-encoded as UTF-8 quoted-printable. */
function replaceBody(items: SplitItem[], node: MimeNode, content: string): SplitItem[] {
  node.setCharset("utf-8");
  node.headers.update("Content-Transfer-Encoding", "quoted-printable");
  return setBody(items, node, Buffer.from(qpEncode(content), "binary"));
}

/**
 * Turns a plain-text body into text plus HTML (multipart/alternative), so the HTML signature
 * shows. Phones often send plain text: without this their mail would only get the text signature.
 */
function convertToAlternative(items: SplitItem[], node: MimeNode, signature: Signature, reply: boolean): SplitItem[] {
  const raw = bodyOf(items, node);
  const text = node.flowed ? unflow(raw, Boolean(node.delSp)) : raw;
  const marker = `\u2063sigwide-${randomBytes(6).toString("hex")}\u2063`;
  const [before = "", after = ""] = insertTextSignature(text, marker, reply).split(marker);
  const boundary = `sigwide-${randomBytes(12).toString("hex")}`;
  const part = (type: string, content: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: quoted-printable", "", qpEncode(content)].join("\r\n");
  const body = [
    part("text/plain", insertTextSignature(text, signature.text, reply)),
    part("text/html", textToHtml(before, signature.html, after)),
    `--${boundary}--${node.root ? "\r\n" : ""}`,
  ].join("\r\n");

  node.headers.update("Content-Type", `multipart/alternative; boundary="${boundary}"`);
  node.headers.remove("Content-Transfer-Encoding");
  if (node.root && !node.headers.hasHeader("MIME-Version")) node.headers.add("MIME-Version", "1.0");
  return setBody(items, node, Buffer.from(body, "utf8"));
}

function mark(items: SplitItem[], value: string): void {
  const root = items.find((i): i is MimeNode => i.type === "node");
  if (!root) return;
  root.headers.remove(KEY_HEADER);
  root.headers.remove(SIGNED_HEADER);
  root.headers.add(SIGNED_HEADER, value);
}

/** Reads what Sigwide needs to pick a signature, without changing anything. */
export async function inspectMessage(raw: Buffer): Promise<MessageInfo> {
  return describe(await split(raw)).info;
}

/**
 * Adds the signature `getSignature` returns to `raw`. Every message that comes back carries
 * the X-Sigwide-Signed header (so the Exchange rule does not send it round again) and has the
 * key header removed. A message that must not be changed comes back otherwise as it was.
 */
export async function stampMessage(raw: Buffer, getSignature: (info: MessageInfo) => Promise<Signature | null>): Promise<StampResult> {
  const items = await split(raw);
  const { info, html, text } = describe(items);

  if (info.skip) {
    if (info.skip !== "already_signed") mark(items, `skipped; ${info.skip}`);
    return { status: "skipped", raw: info.skip === "already_signed" ? raw : join(items), info, reason: info.skip };
  }

  const signature = await getSignature(info);
  if (!signature || (!signature.html && !signature.text)) {
    mark(items, "skipped; no_signature");
    return { status: "skipped", raw: join(items), info, reason: "no_signature" };
  }

  const reply = info.mode === "reply";
  if (!html && text && signature.html) {
    const out = convertToAlternative(items, text, signature, reply);
    mark(out, "1");
    return { status: "signed", raw: join(out), info, placement: "converted-to-html" };
  }
  let out = items;
  let placement: Placement | "text-only" = "text-only";
  if (html && signature.html) {
    const r = insertHtmlSignature(bodyOf(items, html), signature.html, reply);
    placement = r.placement;
    out = replaceBody(out, html, r.html);
  }
  if (text && signature.text) out = replaceBody(out, text, insertTextSignature(bodyOf(items, text), signature.text, reply));
  mark(out, "1");
  return { status: "signed", raw: join(out), info, placement };
}
