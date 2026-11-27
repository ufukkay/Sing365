"use client";
import { useActionState } from "react";
import { Button, Field } from "./ui";
import type { HtmlFormState } from "@/app/(panel)/signatures/actions";

/** Name + HTML (+ when to use it, for a new signature). Errors come back from the server action. */
export function HtmlTemplateForm({
  action,
  initial,
}: {
  action: (prev: HtmlFormState, form: FormData) => Promise<HtmlFormState>;
  initial?: { id: string; name: string; html: string };
}) {
  const [state, formAction, pending] = useActionState(action, { errors: [] });
  const v = state.values;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field id="name" name="name" label="İmzanın adı" required defaultValue={v?.name ?? initial?.name} placeholder="Örn. Kurumsal imza" />
      {!initial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="appliesTo" className="text-sm font-medium">Ne zaman kullanılsın</label>
            <select id="appliesTo" name="appliesTo" defaultValue={v?.appliesTo ?? "both"} className="h-9 rounded-md border border-border-input bg-bg px-2 text-sm">
              <option value="both">Yeni e-postalar ve yanıtlar</option>
              <option value="new">Yalnızca yeni e-postalar</option>
              <option value="reply">Yalnızca yanıtlar ve iletmeler</option>
            </select>
          </div>
          <Field
            id="priority"
            name="priority"
            type="number"
            min={1}
            max={999}
            defaultValue={v?.priority ?? 50}
            label="Öncelik"
            hint="Küçük sayı önce denenir. Hazır imzalar: yanıt 10, kurumsal 100."
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="html" className="text-sm font-medium">
          HTML <span className="text-text-muted">(zorunlu)</span>
        </label>
        <textarea
          id="html"
          name="html"
          required
          defaultValue={v?.html ?? initial?.html}
          rows={18}
          spellCheck={false}
          aria-describedby="html-hint"
          className="rounded-md border border-border-input bg-bg p-3 font-mono text-xs leading-5 text-text"
        />
        <p id="html-hint" className="text-xs text-text-muted">
          Kişiye göre değişen yerlere {"{{alan}}"} yazın. Bir bölümü yalnızca alan doluysa göstermek için {"{{#alan}}...{{/alan}}"}, alan boşsa yerine başka bir şey yazmak için {"{{^alan}}...{{/alan}}"} kullanın.
          Betikler ve dış stil dosyaları çıkarılır; resimler https:// ile başlamalı.
        </p>
      </div>
      {state.errors.length > 0 && (
        <ul role="alert" className="list-disc rounded-md bg-danger-subtle px-6 py-3 text-sm text-danger">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="submit" loading={pending}>
          {initial ? "Kaydet ve önizle" : "İmzayı oluştur ve önizle"}
        </Button>
      </div>
    </form>
  );
}
