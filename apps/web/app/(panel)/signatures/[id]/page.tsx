import Link from "next/link";
import { notFound } from "next/navigation";
import { render } from "@sing365/render";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";
import { buildSignature, fieldValues } from "@/lib/signature";

export const metadata = { title: "İmza önizleme" };

const outcomeText: Record<string, string> = {
  matched: "eşleşti",
  disabled: "kapalı",
  not_active: "tarih dışında",
  wrong_mode: "mesaj türü farklı",
  sender_not_targeted: "gönderen kapsamda değil",
  sender_excepted: "gönderen hariç tutulmuş",
  recipients_not_matched: "alıcılar uymuyor",
};

export default async function SignaturePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string; mode?: string; to?: string }>;
}) {
  const { tenantId } = await requirePanel();
  const { id } = await params;
  const sp = await searchParams;
  const template = await data.getTemplate(tenantId, id);
  if (!template) notFound();

  const users = await data.listUsers(tenantId);
  const user = users.find((u) => u.id === sp.user) ?? users[0];
  const mode = sp.mode === "reply" ? "reply" : "new";
  const to = sp.to ?? "musteri@baskafirma.com";

  const preview = user ? render(template.layout, fieldValues(user)) : null;
  const live = user
    ? await buildSignature(data, { tenantId: tenantId, from: user.email, mode, recipients: to.split(",").map((s) => s.trim()).filter(Boolean) })
    : null;
  const templates = await data.listTemplates(tenantId);
  const nameOf = (tid: string | null) => templates.find((t) => t.id === tid)?.name ?? "imza yok";
  const groups = await data.listGroups(tenantId);
  /** The rules engine reports group ids; show the directory names instead. */
  const readable = (detail: string) => groups.reduce((s, g) => s.split(g.id).join(`"${g.displayName}"`), detail);

  return (
    <>
      <PageHeader
        title={template.name}
        description="Bu imzanın seçilen kişide nasıl göründüğünü ve o kişinin gerçekte hangi imzayı aldığını gösterir."
        actions={
          <Link href="/signatures" className="text-sm font-medium text-accent underline">
            Tüm imzalar
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Önizleme ayarları">
          <form className="flex flex-col gap-4" method="get">
            <div className="flex flex-col gap-1">
              <label htmlFor="user" className="text-sm font-medium">Kişi</label>
              <select id="user" name="user" defaultValue={user?.id} className="h-9 rounded-md border border-border-input bg-bg px-2 text-sm">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">Mesaj türü</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="new" defaultChecked={mode === "new"} /> Yeni e-posta</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="reply" defaultChecked={mode === "reply"} /> Yanıt / iletme</label>
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor="to" className="text-sm font-medium">Alıcılar</label>
              <input id="to" name="to" defaultValue={to} className="h-9 rounded-md border border-border-input bg-bg px-3 text-sm" aria-describedby="to-hint" />
              <p id="to-hint" className="text-xs text-text-muted">Virgülle ayırın. Şirket alan adı dışındakiler dış alıcı sayılır.</p>
            </div>
            <Button type="submit" variant="secondary">Önizlemeyi güncelle</Button>
          </form>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Bu imza"
            actions={template.status === "published" ? <Badge tone="success">Yayında · v{template.version}</Badge> : <Badge>Taslak</Badge>}
          >
            {preview && (
              <>
                <iframe
                  title={`${template.name} önizlemesi`}
                  srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#fff">${preview.html}</body>`}
                  sandbox=""
                  className="h-64 w-full rounded-md border border-border bg-white"
                />
                {preview.missing.length > 0 && (
                  <p className="mt-3 text-xs text-text-muted">
                    Bu kişide boş olan alanlar (satırları gizlendi): {preview.missing.join(", ")}
                  </p>
                )}
              </>
            )}
          </Card>

          <Card title="Bu kişi gerçekte hangi imzayı alır?">
            {live && live.ok ? (
              <>
                <p className="text-sm">
                  Sonuç: <strong>{nameOf(live.templateId)}</strong>
                </p>
                <ol className="mt-3 space-y-1 text-sm">
                  {live.trace.map((t) => (
                    <li key={t.ruleId} className="flex flex-wrap items-center gap-2">
                      <Badge tone={t.outcome === "matched" ? "success" : "neutral"}>{outcomeText[t.outcome]}</Badge>
                      <span>{nameOf(t.templateId)}</span>
                      <span className="text-text-muted">· {readable(t.detail)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-text-muted">Bu kişi için imza bulunamadı.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
