"use client";
import { useState } from "react";
import { Button } from "./ui";

/**
 * Copies a rendered signature as rich text (HTML, with a plain-text fallback) so it can be
 * pasted into Outlook's own signature settings: a manual way to try it before the add-in is deployed.
 */
export function CopySignature({ html, text }: { html: string; text: string }) {
  const [state, setState] = useState<"idle" | "done" | "plain" | "failed">("idle");

  async function copy() {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        setState("done");
      } else {
        await navigator.clipboard.writeText(text);
        setState("plain");
      }
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={copy}>
        İmzayı kopyala
      </Button>
      <p className="text-xs text-text-muted" aria-live="polite">
        {state === "done"
          ? "Kopyalandı. Outlook'un imza ayarlarındaki kutuya Ctrl+V ile yapıştırın."
          : state === "plain"
            ? "Bu tarayıcı yalnızca düz metin kopyaladı; biçimli kopya için Chrome ya da Edge kullanın."
            : state === "failed"
            ? "Kopyalanamadı. İmzayı fareyle seçip Ctrl+C ile kopyalayın."
            : "Outlook'un imza ayarlarına yapıştırarak gerçek bir e-postada deneyebilirsiniz."}
      </p>
    </div>
  );
}
