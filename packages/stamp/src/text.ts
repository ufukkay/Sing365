// Where a signature goes in the plain-text body of an outgoing message.

const REPLY_MARKERS: RegExp[] = [
  // Outlook: a line of underscores above "From: / Kimden:"
  /^_{16,}[ \t]*$/m,
  // "-----Original Message-----" and its translations
  /^-{3,}[ \t]*(?:Original Message|Özgün İleti|Orijinal İleti|Forwarded message|İletilen ileti)[ \t]*-{3,}/im,
  // Gmail / Apple Mail attribution line, English and Turkish
  /^On .{4,300} wrote:[ \t]*$/m,
  /^.{4,300} şunu yazdı:[ \t]*$/m,
  /^.{4,300} tarihinde .{1,200} yazdı:[ \t]*$/m,
  // quoted lines
  /^>/m,
];

// The line a phone's mail app adds by itself: Outlook for iOS/Android, and iPhone/iPad Mail in English and Turkish.
const MOBILE_SIGNATURE =
  /^(?:Get Outlook for (?:iOS|Android)\s*(?:<[^>\r\n]*>)?|Sent from my (?:iPhone|iPad)|(?:iPhone['’]umdan|iPad['’]imden) gönderildi)[ \t]*$/m;

export function insertTextSignature(text: string, signature: string, reply: boolean): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const sig = signature.replace(/\r?\n/g, nl);

  let quote = -1;
  for (const re of REPLY_MARKERS) {
    const m = re.exec(text);
    if (m && (quote === -1 || m.index < quote)) quote = m.index;
  }

  const mobile = MOBILE_SIGNATURE.exec(text);
  if (mobile && (quote === -1 || mobile.index < quote)) {
    return text.slice(0, mobile.index) + sig + text.slice(mobile.index + mobile[0].length);
  }

  if (reply && quote >= 0) {
    const before = text.slice(0, quote).replace(/\s+$/, "");
    return `${before}${nl}${nl}${sig}${nl}${nl}${text.slice(quote)}`;
  }
  const trailing = /(\r?\n)*$/.exec(text)?.[0] ?? "";
  return `${text.slice(0, text.length - trailing.length)}${nl}${nl}${sig}${nl}`;
}

/**
 * Joins the soft line breaks of a format=flowed body (RFC 3676) into whole lines, so the text
 * can be re-encoded without them. The signature separator "-- " is kept as a line of its own.
 */
export function unflow(text: string, delSp: boolean): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const out: string[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.startsWith(" ") ? raw.slice(1) : raw;
    const soft = line.endsWith(" ") && line !== "-- ";
    const piece = soft && delSp ? line.slice(0, -1) : line;
    if (open) out[out.length - 1] += piece;
    else out.push(piece);
    open = soft;
  }
  return out.join(nl);
}
