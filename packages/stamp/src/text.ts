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

// Outlook for iOS/Android's own text signature.
const MOBILE_SIGNATURE = /^Get Outlook for (?:iOS|Android)\s*(?:<[^>\r\n]*>)?[ \t]*$/m;

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
