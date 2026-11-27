import Link from "next/link";
import { notFound } from "next/navigation";
import { render } from "@sing365/render";
import { CopySignature } from "@/components/copy-signature";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";
import { FIELD_HELP, htmlOf } from "@/lib/html-template";
import { buildSignature, fieldValues } from "@/lib/signature";
import { parseVisualLayout, visualFields, visualSampleSources } from "@/lib/visual-signature";
import { duplicateVisualTemplateAction } from "../actions";

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
  searchParams: Promise<{ user?: string; email?: string; mode?: string; to?: string }>;
}) {
  const { tenantId, session } = await requirePanel();
  const { id } = await params;
  const sp = await searchParams;
  const template = await data.getTemplate(tenantId, id);
  if (!template) notFound();

  const people = await data.listPeople(tenantId);
  // An address typed in the form, else a person picked by id (links), else the signed-in admin, else the first person.
  const asked = sp.email?.trim() ?? "";
  const pickUser = async () => {
    if (asked) return data.findUserByEmail(tenantId, asked);
    if (sp.user) return data.getUser(tenantId, sp.user);
    const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
    return me ?? (people[0] ? data.getUser(tenantId, people[0].id) : null);
  };
  const user = await pickUser();
  const mode = sp.mode === "reply" ? "reply" : "new";
  const to = sp.to ?? "musteri@baskafirma.com";

  const preview = render(template.layout, user ? fieldValues(user) : visualSampleSources[0]?.values ?? {});
  const live = user
    ? await buildSignature(data, { tenantId: tenantId, from: user.email, mode, recipients: to.split(",").map((s) => s.trim()).filter(Boolean) })
    : null;
  const templates = await data.listTemplates(tenantId);
  const nameOf = (tid: string | null) => templates.find((t) => t.id === tid)?.name ?? "imza yok";
  const groups = await data.listGroups(tenantId);
  /** The rules engine reports group ids; show the directory names instead. */
  const readable = (detail: string) => groups.reduce((s, g) => s.split(g.id).join(`"${g.displayName}"`), detail);
  const fieldName = (key: string) => visualFields.find((f) => f.key === key)?.label ?? FIELD_HELP.find((f) => f.key === key)?.label ?? key;
  const isHtml = htmlOf(template) !== null;
  const visual = template.kind === "signature" && Boolean(parseVisualLayout(template.layout).layout);
  const editable = visual && template.status !== "archived";

  return (
    <>
      <PageHeader
        title={template.name}
        description="Bu imzanın seçilen kişide nasıl göründüğünü ve o kişinin gerçekte hangi imzayı aldığını gösterir."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {template.kind === "signature" && template.status !== "archived" && (
              <Link href={{ pathname: "/signatures/apply", query: { template: id } }} className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">
                Uygulama ayarları
              </Link>
            )}
            {editable && (
              <Link href={`/signatures/${template.id}/edit`} className="text-sm font-medium text-accent underline">
                Düzenle
              </Link>
            )}
            {visual && (
              <form action={duplicateVisualTemplateAction}>
                <input type="hidden" name="id" value={id} />
                <Button variant="secondary" type="submit">Şablonu çoğalt</Button>
              </form>
            )}
            <Link href="/signatures" className="text-sm font-medium text-accent underline">
              Tüm imzalar
            </Link>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Önizleme ayarları">
          <form className="flex flex-col gap-4" method="get">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium">Kişi</label>
              <input
                id="email"
                name="email"
                type="text"
                list="people"
                autoComplete="off"
                defaultValue={user?.email ?? asked}
                placeholder="Ad veya e-posta yazın"
                aria-describedby="email-hint"
                className="h-9 rounded-md border border-border-input bg-bg px-3 text-sm"
              />
              <datalist id="people">
                {people.map((p) => (
                  <option key={p.id} value={p.email} label={p.displayName} />
                ))}
              </datalist>
              {user ? (
                <p id="email-hint" className="text-xs text-text-muted">{user.displayName}</p>
              ) : (
                <p id="email-hint" role="alert" className="text-xs text-danger">Bu adreste bir kişi bulunamadı.</p>
              )}
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
            actions={template.status === "published" ? <Badge tone="success">Aktif · v{template.version}</Badge> : <Badge>{template.status === "archived" ? "Arşiv" : "Taslak"}</Badge>}
          >
            {!user && <p className="mb-3 text-sm text-text-muted">Örnek kullanıcı bilgileriyle gösteriliyor.</p>}
            <iframe
              title={`${template.name} önizlemesi`}
              srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#fff">${preview.html}</body>`}
              sandbox=""
              className="h-64 w-full rounded-md border border-border bg-white"
            />
            <CopySignature html={preview.html} text={preview.text} />
            {preview.missing.length > 0 && (
              <p className="mt-3 text-xs text-text-muted">
                {preview.missing.map(fieldName).join(", ")} {isHtml ? "alanları bu kişide boş." : "alanları bu kişide boş olduğu için gizlendi."}
              </p>
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
              <p className="text-sm text-text-muted">{user ? "Bu kişi için imza bulunamadı." : "Önce bir kişi seçin."}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
