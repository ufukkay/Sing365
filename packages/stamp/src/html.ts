// Where a signature goes in the HTML body of an outgoing message.
//
// Mail clients mark the start of the quoted conversation in different ways. The earliest
// marker in the body is the current message's own (quoted copies come after it, and Outlook
// on the web prefixes their ids with "x_").

const REPLY_MARKERS: RegExp[] = [
  // Outlook on the web and the new Outlook for Windows
  /<div\b[^>]*\bid\s*=\s*["']?appendonsend\b/i,
  // Outlook for iOS and Android
  /<div\b[^>]*\bid\s*=\s*["']?mail-editor-reference-message-container\b/i,
  // the rule above the quoted "From / Sent / To" block, then the block itself
  /<hr\b[^>]*>\s*(?:<div\b[^>]*>\s*)?(?=<div\b[^>]*\bid\s*=\s*["']?divRplyFwdMsg\b)/i,
  /<div\b[^>]*\bid\s*=\s*["']?divRplyFwdMsg\b/i,
  // classic Outlook for Windows (Word HTML): the bordered header of the quoted message
  /<div\b[^>]*border-top:\s*solid\s+#(?:E1E1E1|B5C4DF)/i,
  // Gmail, Apple Mail / iPhone Mail, and anything else that quotes with a blockquote
  /<div\b[^>]*\bclass\s*=\s*["']?gmail_quote\b/i,
  /<blockquote\b[^>]*\btype\s*=\s*["']?cite\b/i,
  /<blockquote\b/i,
];

// The signature block Outlook for iOS/Android adds by itself ("Get Outlook for iOS"). Ours replaces it.
const MOBILE_SIGNATURE = /<div\b[^>]*\bid\s*=\s*["']?ms-outlook-mobile-signature\b[^>]*>/i;

export type Placement = "replaced-mobile-signature" | "above-quote" | "end";

/** Index of the earliest reply marker, or -1. */
export function replyMarker(html: string): number {
  let best = -1;
  for (const re of REPLY_MARKERS) {
    const m = re.exec(html);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

/** End index (exclusive) of the element whose opening `<div` starts at `start`, by counting nested divs. */
function endOfDiv(html: string, start: number): number {
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** The wrapper every signature goes into, so it can be found again. */
export function signatureBlock(signature: string): string {
  return `<div class="sigwide-signature" style="margin:12px 0">${signature}</div>`;
}

export function insertHtmlSignature(html: string, signature: string, reply: boolean): { html: string; placement: Placement } {
  const block = signatureBlock(signature);
  const quote = replyMarker(html);

  const mobile = MOBILE_SIGNATURE.exec(html);
  if (mobile && (quote === -1 || mobile.index < quote)) {
    const end = endOfDiv(html, mobile.index);
    if (end > 0) return { html: html.slice(0, mobile.index) + block + html.slice(end), placement: "replaced-mobile-signature" };
  }

  if (reply && quote >= 0) return { html: html.slice(0, quote) + block + html.slice(quote), placement: "above-quote" };

  const body = html.toLowerCase().lastIndexOf("</body>");
  if (body >= 0) return { html: html.slice(0, body) + block + html.slice(body), placement: "end" };
  return { html: html + block, placement: "end" };
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paragraph(text: string): string {
  const body = text.replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g, "");
  if (!body) return "";
  const lines = body.split(/\r?\n/).map((l) => escapeText(l).replace(/^ +/, (s) => "&nbsp;".repeat(s.length)));
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4">${lines.join("<br>\n")}</div>`;
}

/**
 * An HTML version of a plain-text message, with the HTML signature where the text signature
 * would go. `before` and `after` are the text on either side of that spot.
 */
export function textToHtml(before: string, signature: string, after: string): string {
  return [
    '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>',
    paragraph(before),
    signatureBlock(signature),
    paragraph(after),
    "</body></html>",
  ].join("\n");
}
