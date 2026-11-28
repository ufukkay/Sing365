"use client";
import { useState } from "react";
import { Button } from "./ui";

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
      {state !== "idle" && (
        <p className="text-xs text-text-muted" aria-live="polite">
          {state === "done"
            ? "Kopyalandı."
            : state === "plain"
              ? "Düz metin olarak kopyalandı."
              : "Kopyalanamadı."}
        </p>
      )}
    </div>
  );
}
