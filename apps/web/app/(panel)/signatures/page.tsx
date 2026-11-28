import Link from "next/link";
import { Archive, ArrowRight, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { render } from "@sing365/render";
import type { Rule } from "@sing365/rules";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import type { Template } from "@/lib/data/types";
import { fieldValues } from "@/lib/signature";
import { publicAssetOrigin } from "@/lib/public-origin";
import { applyQuickTemplate, buildQuickLayout, DEFAULT_QUICK_CONFIG, QUICK_TEMPLATES, withSamples } from "@/lib/quick-signature";
import { parseVisualLayout, visualSampleSources } from "@/lib/visual-signature";
import { changeTemplateArchiveAction, deleteArchivedSignatureAction } from "./actions";

export const metadata = { title: "İmzalar" };

const notices: Record<string, { text: string; error?: true }> = {
  archived: { text: "İmza arşive taşındı." },
  restored: { text: "İmza taslaklara geri alındı." },
  deleted: { text: "İmza silindi." },
  conflict: { text: "İmzanın durumu değişti. Sayfayı yenileyip tekrar deneyin.", error: true },
  "delete-blocked": { text: "İmza silinemedi. Sayfayı yenileyip tekrar deneyin.", error: true },
};

const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" });
const cardLink = "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold hover:bg-surface";

/** One line on who gets the signature, from its rules. */
function audience(rules: Rule[], groups: Map<string, string>): string {
  const rule = rules.find((r) => r.enabled) ?? rules[0];
  if (!rule) return "Henüz kimseye uygulanmıyor";
  const s = rule.senders;
  const parts: string[] = [];
  if (s.all) parts.push("Tüm çalışanlar");
  const names = (s.groups ?? []).map((id) => groups.get(id) ?? "1 grup");
  if (names.length) parts.push(names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} grup` : names.join(", "));
  if (s.departments?.length) parts.push(s.departments.length > 2 ? `${s.departments.length} departman` : s.departments.join(", "));
  if (s.users?.length) parts.push(`${s.users.length} kişi`);
  if (s.attr?.length) parts.push("özel koşul");
  let text = parts.join(" · ") || "Seçili kişiler";
  if (rule.recipients.scope === "external") text += ", dış alıcılara";
  if (rule.recipients.scope === "internal") text += ", iç alıcılara";
  if (rule.appliesTo === "new") text += ", yeni postalarda";
  if (rule.appliesTo === "reply") text += ", yanıtlarda";
  return text;
}

function ArchiveButton({ template }: { template: Template }) {
  const restore = template.status === "archived";
  const Icon = restore ? RotateCcw : Archive;
  return (
    <form action={changeTemplateArchiveAction}>
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="version" value={template.version} />
      <input type="hidden" name="status" value={restore ? "draft" : "archived"} />
      <Button type="submit" variant="ghost" size="sm"><Icon aria-hidden size={15} /> {restore ? "Taslağa dön" : "Arşivle"}</Button>
    </form>
  );
}

function DeleteButton({ template }: { template: Template }) {
  return (
    <details className="relative">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-danger hover:bg-danger-subtle [&::-webkit-details-marker]:hidden">
        <Trash2 aria-hidden size={15} /> Sil
      </summary>
      <form action={deleteArchivedSignatureAction} className="mt-2 grid max-w-64 gap-2 rounded-md border border-border bg-surface p-3 text-xs">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="version" value={template.version} />
        <p className="text-text-muted">Bu imza ve kuralları kalıcı olarak silinecek.</p>
        <Button type="submit" variant="danger" size="sm" name="confirm" value="yes">Kalıcı olarak sil</Button>
      </form>
    </details>
  );
}

export default async function SignaturesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { tenantId, session } = await requirePanel();
  const [templates, rules, groups, me, params] = await Promise.all([
    data.listTemplates(tenantId),
    data.listRules(tenantId),
    data.listGroups(tenantId),
    session ? data.findUserByEmail(tenantId, session.email) : Promise.resolve(null),
    searchParams,
  ]);
  const groupNames = new Map(groups.map((g) => [g.id, g.displayName]));
  const values = me ? fieldValues(me) : visualSampleSources[0]!.values;
  const signatures = templates.filter((template) => template.kind === "signature");
  const notice = params.notice ? notices[params.notice] : undefined;
  const rulesOf = (id: string) => rules.filter((rule) => rule.templateId === id);
  const priority = (id: string) => Math.min(...rulesOf(id).map((rule) => rule.priority));
  const byName = (a: Template, b: Template) => a.name.localeCompare(b.name, "tr");
  const active = signatures.filter((t) => t.status === "published").sort((a, b) => priority(a.id) - priority(b.id) || byName(a, b));
  const drafts = signatures.filter((t) => t.status === "draft").sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const archived = signatures.filter((t) => t.status === "archived").sort(byName);

  function preview(template: Template) {
    try {
      return render(template.layout, values).html;
    } catch {
      return "";
    }
  }

  function SignatureCard({ template }: { template: Template }) {
    const isArchived = template.status === "archived";
    const isActive = template.status === "published";
    const editable = !isArchived && Boolean(parseVisualLayout(template.layout).layout);
    const html = isArchived ? "" : preview(template);
    return (
      <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card">
        {!isArchived && (
          <Link href={editable ? `/signatures/${template.id}/edit` : `/signatures/${template.id}`} aria-label={`${template.name} imzasını aç`} className="relative block h-40 overflow-hidden border-b border-border bg-white">
            {html ? (
              <iframe
                title={`${template.name} önizlemesi`}
                sandbox=""
                tabIndex={-1}
                className="pointer-events-none absolute left-0 top-0 h-[214px] w-[133.34%] origin-top-left scale-[0.75]"
                srcDoc={`<!doctype html><html><body style="margin:16px;background:#fff">${html}</body></html>`}
              />
            ) : (
              <span className="grid h-full place-items-center text-xs text-gray-500">Önizleme yok</span>
            )}
          </Link>
        )}
        <div className="flex flex-1 flex-col gap-1 px-4 pt-3">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/signatures/${template.id}`} className="min-w-0 break-words font-semibold leading-5 text-text underline-offset-4 hover:text-accent hover:underline">{template.name}</Link>
            {isActive && <Badge tone="success">Kullanımda</Badge>}
          </div>
          <p className="text-xs text-text-muted">
            {isActive ? audience(rulesOf(template.id), groupNames) : `Son değişiklik ${date.format(new Date(template.updatedAt))}`}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
          {editable && <Link href={`/signatures/${template.id}/edit`} className={`${cardLink} text-text`}><PenLine aria-hidden size={14} /> Düzenle</Link>}
          {!isArchived && (
            <Link href={{ pathname: "/signatures/apply", query: { template: template.id } }} className={`${cardLink} text-accent`}>
              {isActive ? "Kimlere uygulanır" : "Kullanıma al"} <ArrowRight aria-hidden size={14} />
            </Link>
          )}
          <span className="ml-auto flex items-center gap-1">
            <ArchiveButton template={template} />
            {isArchived && <DeleteButton template={template} />}
          </span>
        </div>
      </article>
    );
  }

  const grid = "grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3";
  const origin = publicAssetOrigin();
  const ready = QUICK_TEMPLATES.map((t) => {
    let html = "";
    try {
      html = render(buildQuickLayout(withSamples(applyQuickTemplate(DEFAULT_QUICK_CONFIG, t), origin).config, origin), values).html;
    } catch {
      html = "";
    }
    return { ...t, html };
  });
  return (
    <>
      <PageHeader title="İmzalar" actions={
        <Link href="/signatures/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          <Plus aria-hidden size={17} /> Yeni imza
        </Link>
      } />
      {notice && <div role={notice.error ? "alert" : "status"} className={`mb-4 rounded-md px-4 py-3 text-sm ${notice.error ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}>{notice.text}</div>}

      {active.length + drafts.length === 0 ? (
        <Card>
          <EmptyState title="Henüz imza yok" body="Aşağıdaki şablonlardan birini seçin ya da “Yeni imza” ile kendiniz tasarlayın." action={null} />
        </Card>
      ) : (
        <>
          <section aria-labelledby="sig-active" className="mb-8">
            <h2 id="sig-active" className="mb-1 text-sm font-semibold text-text">Kullanımda <span className="font-normal text-text-muted">({active.length})</span></h2>
            <p className="mb-3 text-xs text-text-muted">Bu imzalar gönderilen postalara ekleniyor. Önizlemeler {me ? "sizin bilgilerinizle" : "örnek bir kişiyle"} gösteriliyor.</p>
            {active.length ? (
              <div className={grid}>{active.map((t) => <SignatureCard key={t.id} template={t} />)}</div>
            ) : (
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">Henüz kullanımda imza yok. Aşağıdaki taslaklardan birini “Kullanıma al” ile etkinleştirin.</p>
            )}
          </section>
          {drafts.length > 0 && (
            <section aria-labelledby="sig-drafts" className="mb-8">
              <h2 id="sig-drafts" className="mb-3 text-sm font-semibold text-text">Taslaklar <span className="font-normal text-text-muted">({drafts.length})</span></h2>
              <div className={grid}>{drafts.map((t) => <SignatureCard key={t.id} template={t} />)}</div>
            </section>
          )}
        </>
      )}

      <section id="sablonlar" aria-labelledby="sig-templates" className="mb-8 scroll-mt-20">
        <h2 id="sig-templates" className="mb-1 text-sm font-semibold text-text">Şablonlar</h2>
        <p className="mb-3 text-xs text-text-muted">Hazır bir tasarımla başlayın; logonuzu, renginizi ve bilgileri sonra değiştirebilirsiniz.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ready.map((t) => (
            <Link key={t.id} href={{ pathname: "/signatures/new", query: { template: t.id } }} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card hover:border-accent">
              <span className="relative block h-32 overflow-hidden border-b border-border bg-white">
                {t.html && (
                  <iframe title={`${t.title} şablonu`} sandbox="" tabIndex={-1}
                    className="pointer-events-none absolute left-0 top-0 h-[214px] w-[166.67%] origin-top-left scale-[0.6]"
                    srcDoc={`<!doctype html><html><body style="margin:16px;background:#fff">${t.html}</body></html>`} />
                )}
              </span>
              <span className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{t.title}</span>
                  <span className="block truncate text-xs text-text-muted">{t.subtitle}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-accent group-hover:underline">Kullan</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {archived.length > 0 && (
        <details className="group" open={params.notice === "deleted" || params.notice === "delete-blocked" || params.notice === "archived"}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span> Arşiv ({archived.length})
          </summary>
          <div className="mt-3 grid gap-2">
            {archived.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
                <Link href={`/signatures/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-text hover:underline">{t.name}</Link>
                <span className="text-xs text-text-muted">{date.format(new Date(t.updatedAt))}</span>
                <ArchiveButton template={t} />
                <DeleteButton template={t} />
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
