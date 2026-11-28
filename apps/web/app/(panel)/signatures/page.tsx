import Link from "next/link";
import { Archive, ArrowRight, FileText, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import type { Template } from "@/lib/data/types";
import { parseVisualLayout } from "@/lib/visual-signature";
import { changeTemplateArchiveAction, deleteArchivedSignatureAction } from "./actions";

export const metadata = { title: "İmzalar" };

const filters = [
  { value: "all", label: "Tümü" },
  { value: "draft", label: "Taslak" },
  { value: "published", label: "Aktif" },
  { value: "archived", label: "Arşiv" },
] as const;

const notices: Record<string, { text: string; error?: true }> = {
  archived: { text: "Şablon arşive taşındı." },
  restored: { text: "Şablon taslaklara geri alındı." },
  deleted: { text: "Şablon silindi." },
  conflict: { text: "Şablonun durumu değişti. Geçerli sürümü kontrol edin.", error: true },
  "delete-blocked": { text: "Şablon silinemedi. Şablon başka bir kayda bağlı olabilir veya sürümü değişmiş olabilir.", error: true },
};

const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" });
const cardLink = "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold hover:bg-surface";

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
        <p className="text-text-muted">Bu şablon ve uygulama kuralları kalıcı olarak silinecek.</p>
        <Button type="submit" variant="danger" size="sm" name="confirm" value="yes">Kalıcı olarak sil</Button>
      </form>
    </details>
  );
}

export default async function SignaturesPage({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  const { tenantId } = await requirePanel();
  const [templates, rules, params] = await Promise.all([data.listTemplates(tenantId), data.listRules(tenantId), searchParams]);
  const signatures = templates.filter((template) => template.kind === "signature");
  const current = filters.find((filter) => filter.value === params.status) ?? filters[0];
  const notice = params.notice ? notices[params.notice] : undefined;
  const priority = (id: string) => Math.min(...rules.filter((rule) => rule.templateId === id).map((rule) => rule.priority));
  const visible = signatures.filter((template) => current.value === "all" || template.status === current.value)
    .sort((a, b) => priority(a.id) - priority(b.id) || a.name.localeCompare(b.name, "tr"));

  return (
    <>
      <PageHeader title="İmzalar" actions={
        <Link href="/signatures/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">
          <Plus aria-hidden size={17} /> Yeni imza
        </Link>
      } />
      <nav aria-label="Şablon durumu" className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        {filters.map((filter) => {
          const active = filter.value === current.value;
          const count = filter.value === "all" ? signatures.length : signatures.filter((template) => template.status === filter.value).length;
          return (
            <Link key={filter.value} href={filter.value === "all" ? "/signatures" : { pathname: "/signatures", query: { status: filter.value } }}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${active ? "bg-accent-subtle text-accent" : "text-text-muted hover:bg-surface-raised hover:text-text"}`}>
              {filter.label}<span className="text-xs tabular-nums">{count}</span>
            </Link>
          );
        })}
      </nav>
      {notice && <div role={notice.error ? "alert" : "status"} className={`mb-4 rounded-md px-4 py-3 text-sm ${notice.error ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}>{notice.text}</div>}

      {visible.length === 0 ? (
        <Card>
          <EmptyState title={current.value === "all" ? "Henüz imza yok" : `${current.label} şablon bulunamadı`}
            body={current.value === "all" ? "İlk imzanızı bileşen ve Entra ID alanlarıyla tasarlayın." : undefined}
            action={current.value === "all" || current.value === "draft" ? <Link href="/signatures/new" className="text-sm font-semibold text-accent underline">İmza oluştur</Link> : undefined} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((template) => {
            const archived = template.status === "archived";
            const active = template.status === "published";
            const editable = !archived && Boolean(parseVisualLayout(template.layout).layout);
            const order = priority(template.id);
            return (
              <article key={template.id} className="rounded-lg border border-border bg-surface-raised shadow-card">
                <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent"><FileText aria-hidden size={19} /></div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/signatures/${template.id}`} className="block break-words font-semibold leading-5 text-text underline-offset-4 hover:text-accent hover:underline">{template.name}</Link>
                    <p className="mt-1 text-xs text-text-muted">{date.format(new Date(template.updatedAt))}{active && Number.isFinite(order) ? ` · Sıra ${order}` : ""}</p>
                  </div>
                  <Badge tone={active ? "success" : "neutral"}>{active ? "Aktif" : archived ? "Arşiv" : "Taslak"}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-start gap-1 border-t border-border px-3 py-2 sm:px-4">
                  {editable && <Link href={`/signatures/${template.id}/edit`} className={`${cardLink} text-text`}><PenLine aria-hidden size={14} /> Düzenle</Link>}
                  {!archived && <Link href={{ pathname: "/signatures/apply", query: { template: template.id } }} className={`${cardLink} text-accent`}>Uygula <ArrowRight aria-hidden size={14} /></Link>}
                  <ArchiveButton template={template} />
                  {archived && <DeleteButton template={template} />}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
