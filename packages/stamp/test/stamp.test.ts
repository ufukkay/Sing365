import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { inspectMessage, insertHtmlSignature, insertTextSignature, stampMessage, type Signature } from "../src/index";

const SIG: Signature = {
  html: '<table data-sing365="1"><tr><td><b>Ufuk KAYA</b> | Kıdemli Uzman</td></tr></table>',
  text: "Ufuk KAYA\nKıdemli Uzman",
};
const sign = async () => SIG;

const qp = (s: string) =>
  Buffer.from(s, "utf8")
    .toString("binary")
    .replace(/[^\x20-\x3c\x3e-\x7e\r\n]/g, (c) => `=${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function message(headers: string[], body: string): Buffer {
  return Buffer.from([...headers, "MIME-Version: 1.0", "", body].join("\r\n"), "binary");
}

function alternative(headers: string[], text: string, html: string): Buffer {
  return message(
    [...headers, 'Content-Type: multipart/alternative; boundary="alt"'],
    [
      "--alt",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      qp(text),
      "--alt",
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      qp(html),
      "--alt--",
      "",
    ].join("\r\n"),
  );
}

const FROM = ["From: Ufuk KAYA <Ufuk.Kaya@talay.com>", "To: musteri@baskafirma.com", "Date: Fri, 27 Nov 2026 20:00:00 +0300"];

describe("HTML placement", () => {
  it("goes before </body> in a new message", () => {
    const r = insertHtmlSignature("<html><body><p>Merhaba</p></body></html>", "SIG", false);
    expect(r.placement).toBe("end");
    expect(r.html).toMatch(/<p>Merhaba<\/p><div class="sing365-signature"[^>]*>SIG<\/div><\/body>/);
  });

  it("goes above the quoted message in replies from Outlook on the web", () => {
    const html =
      '<body><div>Tamam.</div><div id="appendonsend"></div><hr style="display:inline-block;width:98%" tabindex="-1">' +
      '<div id="divRplyFwdMsg" dir="ltr"><b>Kimden:</b> Ali</div><div id="x_appendonsend"></div></body>';
    const r = insertHtmlSignature(html, "SIG", true);
    expect(r.placement).toBe("above-quote");
    expect(r.html.indexOf("SIG")).toBeLessThan(r.html.indexOf('id="appendonsend"'));
    expect(r.html.indexOf("SIG")).toBeGreaterThan(r.html.indexOf("Tamam."));
  });

  it("goes above the bordered header in replies from classic Outlook", () => {
    const html =
      '<body><div class=WordSection1><p class=MsoNormal>Teşekkürler</p><p class=MsoNormal>&nbsp;</p>' +
      '<div><div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm"><p class=MsoNormal><b>From:</b> Ali</p></div></div>' +
      "<p class=MsoNormal>eski mesaj</p></div></body>";
    const r = insertHtmlSignature(html, "SIG", true);
    expect(r.html.indexOf("SIG")).toBeGreaterThan(r.html.indexOf("Teşekkürler"));
    expect(r.html.indexOf("SIG")).toBeLessThan(r.html.indexOf("From:"));
  });

  it("replaces the signature Outlook for iOS adds by itself", () => {
    const html =
      '<body><div dir="auto">Selam</div><div><br></div><div id="ms-outlook-mobile-signature" dir="auto"><div dir="ltr">Get <a href="https://aka.ms/o0ukef">Outlook for iOS</a></div></div>' +
      '<div id="mail-editor-reference-message-container"><b>From:</b> Ali</div></body>';
    const r = insertHtmlSignature(html, "SIG", true);
    expect(r.placement).toBe("replaced-mobile-signature");
    expect(r.html).not.toContain("Outlook for iOS");
    expect(r.html.indexOf("SIG")).toBeLessThan(r.html.indexOf("mail-editor-reference-message-container"));
    expect(r.html).toContain("</div><div id=\"mail-editor-reference-message-container\"");
  });

  it("falls back to the end of a reply with no recognisable quote", () => {
    expect(insertHtmlSignature("<p>Tamam</p>", "SIG", true)).toEqual({ html: '<p>Tamam</p><div class="sing365-signature" style="margin:12px 0">SIG</div>', placement: "end" });
  });
});

describe("text placement", () => {
  it("appends to a new message, keeping its line endings", () => {
    expect(insertTextSignature("Merhaba\r\n\r\n", "A\nB", false)).toBe("Merhaba\r\n\r\nA\r\nB\r\n");
  });

  it("goes above Outlook's quoted block in replies", () => {
    const t = "Tamam.\n\n________________________________\nKimden: Ali\nKonu: Teklif\n\neski";
    expect(insertTextSignature(t, "SIG", true)).toBe("Tamam.\n\nSIG\n\n________________________________\nKimden: Ali\nKonu: Teklif\n\neski");
  });

  it("goes above 'On ... wrote:' and Turkish 'şunu yazdı:' lines", () => {
    expect(insertTextSignature("Ok\n\nOn Fri, 27 Nov 2026 Ali <a@b.c> wrote:\n> hi", "SIG", true)).toBe("Ok\n\nSIG\n\nOn Fri, 27 Nov 2026 Ali <a@b.c> wrote:\n> hi");
    expect(insertTextSignature("Ok\n\n27 Kas 2026 Cum, Ali şunu yazdı:\n> selam", "SIG", true)).toContain("Ok\n\nSIG\n\n27 Kas");
  });

  it("replaces 'Get Outlook for iOS'", () => {
    expect(insertTextSignature("Selam\r\n\r\nGet Outlook for iOS<https://aka.ms/o0ukef>\r\n", "SIG", false)).toBe("Selam\r\n\r\nSIG\r\n");
  });
});

describe("stampMessage", () => {
  it("signs a new message from Outlook on the web: HTML and text, UTF-8, marked and key removed", async () => {
    const raw = alternative(
      [...FROM, "Subject: Teklif", "X-Sing365-Key: secret-key"],
      "Merhaba,\r\nTeklif ektedir.\r\n",
      '<html><head><meta charset="utf-8"></head><body><div style="font-family:Calibri">Merhaba,<br>Teklif ektedir.</div></body></html>',
    );
    const seen: unknown[] = [];
    const r = await stampMessage(raw, async (info) => {
      seen.push(info);
      return SIG;
    });
    expect(seen).toEqual([{ from: "ufuk.kaya@talay.com", mode: "new", subject: "Teklif", key: "secret-key", skip: null }]);
    expect(r.status).toBe("signed");
    const m = await simpleParser(r.raw);
    expect(m.headers.get("x-sing365-signed")).toBe("1");
    expect(m.headers.has("x-sing365-key")).toBe(false);
    expect(m.html).toContain("Teklif ektedir.</div><div class=\"sing365-signature\"");
    expect(m.html).toContain("Kıdemli Uzman");
    expect(m.text).toBe("Merhaba,\nTeklif ektedir.\n\nUfuk KAYA\nKıdemli Uzman\n");
    expect(m.subject).toBe("Teklif");
  });

  it("treats Turkish 'YNT:' subjects and In-Reply-To as replies and signs above the quote", async () => {
    const raw = alternative(
      [...FROM, "Subject: =?utf-8?Q?YNT:_Fiyat_g=C3=BCncellemesi?=", "In-Reply-To: <abc@talay.com>"],
      "Tamam.\r\n\r\n________________________________\r\nKimden: Ali\r\n\r\neski\r\n",
      '<html><body><div>Tamam.</div><div id="appendonsend"></div><hr tabindex="-1"><div id="divRplyFwdMsg"><b>Kimden:</b> Ali</div><div>eski</div></body></html>',
    );
    const info = await inspectMessage(raw);
    expect(info.mode).toBe("reply");
    expect(info.subject).toBe("YNT: Fiyat güncellemesi");
    const m = await simpleParser((await stampMessage(raw, sign)).raw);
    expect(String(m.html).indexOf("sing365-signature")).toBeLessThan(String(m.html).indexOf("appendonsend"));
    expect(m.text).toContain("Tamam.\n\nUfuk KAYA\nKıdemli Uzman\n\n____");
  });

  it("reads a base64 windows-1254 body from classic Outlook and writes UTF-8 back", async () => {
    const html =
      '<html><body><div class=WordSection1><p class=MsoNormal>Teşekkürler, görüşmek üzere.</p>' +
      '<div><div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm"><p class=MsoNormal><b>From:</b> Ali</p></div></div></div></body></html>';
    const raw = message(
      [...FROM, "Subject: RE: Teklif", 'Content-Type: text/html; charset="windows-1254"', "Content-Transfer-Encoding: base64"],
      iconv.encode(html, "windows-1254").toString("base64").replace(/.{76}/g, "$&\r\n"),
    );
    const r = await stampMessage(raw, sign);
    const m = await simpleParser(r.raw);
    expect(m.html).toContain("Teşekkürler, görüşmek üzere.</p><div><div class=\"sing365-signature\"");
    expect(String(m.html).indexOf("Kıdemli")).toBeLessThan(String(m.html).indexOf("From:"));
    expect(r.raw.toString("binary")).toMatch(/charset=utf-8/i);
  });

  it("replaces Outlook for iOS's own signature in a mail sent from a phone", async () => {
    const raw = alternative(
      [...FROM, "Subject: Yoldayım"],
      "Selam\r\n\r\nGet Outlook for iOS<https://aka.ms/o0ukef>\r\n",
      '<html><body><div dir="auto">Selam</div><div><br></div><div id="ms-outlook-mobile-signature" dir="auto"><div dir="ltr">Get <a href="https://aka.ms/o0ukef">Outlook for iOS</a></div></div></body></html>',
    );
    const r = await stampMessage(raw, sign);
    expect(r.status === "signed" && r.placement).toBe("replaced-mobile-signature");
    const m = await simpleParser(r.raw);
    expect(m.html).not.toContain("Outlook for iOS");
    expect(m.text).toBe("Selam\n\nUfuk KAYA\nKıdemli Uzman\n");
  });

  it("signs a plain-text-only message", async () => {
    const raw = message([...FROM, "Subject: Not", "Content-Type: text/plain; charset=us-ascii", "Content-Transfer-Encoding: 7bit"], "Kisa not.\r\n");
    const r = await stampMessage(raw, sign);
    expect(r.status === "signed" && r.placement).toBe("text-only");
    expect((await simpleParser(r.raw)).text).toBe("Kisa not.\n\nUfuk KAYA\nKıdemli Uzman\n");
  });

  it("leaves attachments and forwarded messages byte-for-byte as they were", async () => {
    const pdf = Buffer.from(Array.from({ length: 3000 }, (_, i) => i % 251));
    const raw = message(
      [...FROM, "Subject: FW: Belgeler", 'Content-Type: multipart/mixed; boundary="mix"'],
      [
        "--mix",
        'Content-Type: text/html; charset="utf-8"',
        "",
        "<html><body><p>Ekte.</p></body></html>",
        "--mix",
        'Content-Type: application/pdf; name="fatura.pdf"',
        'Content-Disposition: attachment; filename="fatura.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        pdf.toString("base64").replace(/.{76}/g, "$&\r\n"),
        "--mix",
        "Content-Type: message/rfc822",
        "",
        "From: Ali <ali@x.com>",
        "Subject: eski",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<html><body><p>ic mesaj</p></body></html>",
        "--mix--",
        "",
      ].join("\r\n"),
    );
    const r = await stampMessage(raw, sign);
    const m = await simpleParser(r.raw);
    expect(m.html).toContain("<p>Ekte.</p><div class=\"sing365-signature\"");
    const att = m.attachments.find((a) => a.filename === "fatura.pdf");
    expect(createHash("sha256").update(att!.content).digest("hex")).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(r.raw.toString("binary")).toContain("<html><body><p>ic mesaj</p></body></html>");
    expect(r.raw.toString("binary").match(/sing365-signature/g)).toHaveLength(1);
  });

  it("does not touch S/MIME, meeting invites or auto-replies, but still marks them", async () => {
    const smime = message([...FROM, "Subject: Gizli", 'Content-Type: multipart/signed; protocol="application/pkcs7-signature"; boundary="s"'], "--s\r\nContent-Type: text/plain\r\n\r\nimzali\r\n--s--\r\n");
    const invite = message([...FROM, "Subject: Toplanti", 'Content-Type: multipart/alternative; boundary="c"'], "--c\r\nContent-Type: text/plain\r\n\r\nDavet\r\n--c\r\nContent-Type: text/calendar; method=REQUEST\r\n\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n--c--\r\n");
    const auto = message([...FROM, "Subject: Ofis disi", "Auto-Submitted: auto-replied", "Content-Type: text/plain"], "Izindeyim.\r\n");
    for (const [raw, reason] of [[smime, "smime"], [invite, "calendar"], [auto, "auto_submitted"]] as const) {
      let asked = false;
      const r = await stampMessage(raw, async () => {
        asked = true;
        return SIG;
      });
      expect(r).toMatchObject({ status: "skipped", reason });
      expect(asked).toBe(false);
      expect(r.raw.toString("binary")).toContain(`X-Sing365-Signed: skipped; ${reason}`);
      expect(r.raw.toString("binary").split("\r\n\r\n").slice(1).join("\r\n\r\n")).toBe(raw.toString("binary").split("\r\n\r\n").slice(1).join("\r\n\r\n"));
    }
  });

  it("returns a message that already went through Sing365 exactly as it came", async () => {
    const raw = message([...FROM, "Subject: x", "X-Sing365-Signed: 1", "Content-Type: text/plain"], "x\r\n");
    const r = await stampMessage(raw, sign);
    expect(r).toMatchObject({ status: "skipped", reason: "already_signed" });
    expect(r.raw.equals(raw)).toBe(true);
  });

  it("marks the message and changes nothing else when the sender has no signature", async () => {
    const raw = message([...FROM, "Subject: x", "X-Sing365-Key: k", "Content-Type: text/plain"], "x\r\n");
    const r = await stampMessage(raw, async () => null);
    expect(r).toMatchObject({ status: "skipped", reason: "no_signature" });
    expect(r.raw.toString("binary")).toContain("X-Sing365-Signed: skipped; no_signature");
    expect(r.raw.toString("binary")).not.toContain("X-Sing365-Key");
    expect(r.raw.toString("binary").endsWith("\r\n\r\nx\r\n")).toBe(true);
  });
});
