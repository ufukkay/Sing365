import Link from "next/link";
import { ArrowLeft, PenLine, Plus } from "lucide-react";
import { render } from "@sing365/render";
import type { Rule } from "@sing365/rules";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import type { DirectoryGroup, Template } from "@/lib/data/types";
import { fieldValues } from "@/lib/signature";
import { hasSignatureContent, parseVisualLayout, simpleVisualRule, visualSampleSources } from "@/lib/visual-signature";
import { changeVisualTemplateStatusAction, configureTemplateApplicationAction } from "../actions";

export const metadata = { title: "Kimlere uygulanır" };

const recipientLabels = {
  any: "Herkese (iç ve dış)",
  internal: "Sadece şirket içine",
  external: "Sadece şirket dışına",
} satisfies Record<Rule["recipients"]["scope"], string>;

const modeLabels = {
  both: "Yeni postalar ve yanıtlar",
  new: "Sadece yeni postalar",
  reply: "Sadece yanıt ve iletmeler",
} satisfies Record<Rule["appliesTo"], string>;

const notices = {
  saved: { text: "Kaydedildi.", error: false },
  draft: { text: "İmza taslak olarak kaydedildi. Kimlere gideceğini seçip kullanıma alın.", error: false },
  published: { text: "İmza kullanıma alındı. Seçilen kişilerin postalarına ekleniyor.", error: false },
  unpublished: { text: "İmza kullanımdan kaldırıldı.", error: false },
  empty: { text: "Kullanıma almak için imzaya en az bir içerik ekleyin.", error: true },
  rule: { text: "Kullanıma almadan önce kimlere uygulanacağını kaydedin.", error: true },
  conflict: { text: "İmza başka bir oturumda değişti. Sayfadaki güncel hâli kontrol edip tekrar deneyin.", error: true },
  invalid: { text: "İmza bulunamadı veya ayarlar geçersiz. Tekrar deneyin.", error: true },
  group: { text: "Seçilen grup dizinde bulunamadı. Başka bir grup seçin.", error: true },
  advanced: { text: "Bu imza gelişmiş kurallar kullanıyor. Mevcut kurallar aşağıda gösteriliyor.", error: true },
};

const linkButton = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm font-semibold text-text hover:bg-surface";
const selectClass = "h-10 w-full rounded-md border border-border-input bg-bg px-3 text-sm text-text";

function TemplateStatus({ status }: { status: Template["status"] }) {
  if (status === "published") return <Badge tone="success">Kullanımda</Badge>;
  return <Badge>{status === "archived" ? "Arşiv" : "Taslak"}</Badge>;
}

function TemplateFields({ template }: { template: Template }) {
  return (
    <>
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="version" value={template.version} />
    </>
  );
}

function ScopeForm({ template, groups, rule }: { template: Template; groups: DirectoryGroup[]; rule?: Rule }) {
  const groupId = rule?.senders.groups?.[0] ?? "";
  const missingGroup = groupId !== "" && !groups.some((group) => group.id === groupId);
  const priority = rule?.priority ?? 50;

  return (
    <form action={configureTemplateApplicationAction} key={`${template.id}:${template.version}`}>
      <TemplateFields template={template} />
      <div className="grid gap-4">
        <label className="flex min-w-0 flex-col gap-1.5 font-medium">
          Kimlerin postalarına eklensin?
          <select name="senderGroup" className={selectClass} defaultValue={groupId}>
            <option value="">Tüm çalışanlar</option>
            {missingGroup && <option value={groupId}>Dizinde bulunamayan mevcut grup</option>}
            {groups.map((group) => <option key={group.id} value={group.id}>{group.displayName} grubu</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 font-medium">
            Hangi alıcılara giden postalarda?
            <select name="recipientScope" className={selectClass} defaultValue={rule?.recipients.scope ?? "any"}>
              {Object.entries(recipientLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 font-medium">
            Hangi postalarda?
            <select name="appliesTo" className={selectClass} defaultValue={rule?.appliesTo ?? "both"}>
              {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <details className="mt-4 rounded-md border border-border bg-surface px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-text-muted">Gelişmiş ayarlar</summary>
        <div className="mt-3 grid gap-4 pb-1 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 font-medium">
            Öncelik
            <input
              name="priority"
              type="number"
              min={Math.min(1, priority)}
              max={Math.max(999, priority)}
              step={1}
              required
              aria-describedby="signature-priority-help"
              defaultValue={priority}
              className={selectClass}
            />
            <span id="signature-priority-help" className="text-xs font-normal text-text-muted">Bir kişi birden fazla imzaya uyuyorsa küçük sayılı imza kullanılır.</span>
          </label>
          <label className="flex items-start gap-2 self-start pt-7">
            <input type="checkbox" name="enabled" value="on" defaultChecked={rule?.enabled ?? true} className="mt-0.5 size-4 accent-accent" />
            <span className="font-medium">
              Bu kural açık
              <span className="block text-xs font-normal text-text-muted">Kapatırsanız imza kullanımda olsa bile kimseye eklenmez.</span>
            </span>
          </label>
        </div>
      </details>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {template.status === "published" && <p className="text-sm text-text-muted">Kaydettiğiniz anda sonraki postalarda geçerli olur.</p>}
        <Button type="submit" variant="secondary" className="ml-auto">Kaydet</Button>
      </div>
    </form>
  );
}

function RuleSummary({ rules, groups }: { rules: Rule[]; groups: DirectoryGroup[] }) {
  const groupNames = new Map(groups.map((group) => [group.id, group.displayName]));

  return (
    <>
      <p className="mb-4 text-sm text-text-muted">Bu imza gelişmiş kurallar kullanıyor.</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {[...rules].sort((a, b) => a.priority - b.priority).map((rule) => {
          const { senders } = rule;
          const targets = [
            ...(senders.groups ?? []).map((id) => groupNames.get(id) ?? "Dizinde bulunamayan grup"),
            ...(senders.departments ?? []),
            senders.users?.length ? `${senders.users.length} kullanıcı` : "",
            senders.attr?.length ? `${senders.attr.length} alan koşulu` : "",
          ].filter(Boolean);

          return (
            <li key={rule.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{senders.all ? "Tüm çalışanlar" : targets.join(", ") || "Özel gönderen kapsamı"}</p>
                <Badge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "Etkin kural" : "Devre dışı"}</Badge>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {recipientLabels[rule.recipients.scope]} · {modeLabels[rule.appliesTo]} · Öncelik {rule.priority}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!!rule.recipients.domains?.length && <Badge>{rule.recipients.domains.length} alan adı koşulu</Badge>}
                {!!Object.keys(rule.exceptions ?? {}).length && <Badge>Gönderen istisnası</Badge>}
                {!!(rule.activeFrom || rule.activeUntil) && <Badge>Tarih aralığı</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default async function ApplySignaturePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; notice?: string | string[] }>;
}) {
  const [{ tenantId, session }, query] = await Promise.all([requirePanel(), searchParams]);
  const [templates, rules, groups] = await Promise.all([data.listTemplates(tenantId), data.listRules(tenantId), data.listGroups(tenantId)]);
  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  const signatures = templates.filter((template) => template.kind === "signature" && template.status !== "archived");
  const requested = typeof query.template === "string" ? signatures.find((template) => template.id === query.template) : undefined;
  const template = query.template ? requested : signatures.find((entry) => entry.status === "draft") ?? signatures[0];
  const notice = typeof query.notice === "string" && Object.hasOwn(notices, query.notice)
    ? notices[query.notice as keyof typeof notices]
    : query.template && !requested ? notices.invalid : undefined;
  const matchingRules = template ? rules.filter((rule) => rule.templateId === template.id) : [];
  const simpleRule = simpleVisualRule(matchingRules);
  const enabledRules = matchingRules.some((rule) => rule.enabled);
  let previewHtml = "";
  if (template) {
    try {
      previewHtml = render(template.layout, me ? fieldValues(me) : visualSampleSources[0]!.values).html;
    } catch {
      previewHtml = "";
    }
  }
  const editable = template ? Boolean(parseVisualLayout(template.layout).layout) : false;
  const published = template?.status === "published";
  const canPublish = Boolean(template) && enabledRules && hasSignatureContent(template!.layout);

  return (
    <>
      <PageHeader
        title={template ? template.name : "Kimlere uygulanır"}
        description={template ? "Bu imzanın kimlerin postalarına ekleneceğini seçin." : undefined}
        actions={<Link href="/signatures" className={linkButton}><ArrowLeft aria-hidden size={16} /> Tüm imzalar</Link>}
      />
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`mb-5 rounded-md border border-border px-4 py-3 ${notice.error ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}
        >
          {notice.text}
        </p>
      )}
      {template ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="min-w-0 space-y-4">
            <Card title="1. Kimlere uygulanır">
              {simpleRule || matchingRules.length === 0
                ? <ScopeForm template={template} groups={groups} rule={simpleRule} />
                : <RuleSummary rules={matchingRules} groups={groups} />}
            </Card>
            <Card title="2. Kullanıma alın" actions={<TemplateStatus status={template.status} />}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-sm text-text-muted">
                  {!published && !hasSignatureContent(template.layout) ? "Kullanıma almak için imzaya içerik ekleyin."
                    : !enabledRules ? "Önce yukarıdan kimlere uygulanacağını kaydedin."
                    : published ? "İmza, seçtiğiniz kişilerin postalarına ekleniyor."
                    : "Hazır. Kullanıma aldığınızda seçtiğiniz kişilerin postalarına eklenmeye başlar."}
                </p>
                <form action={changeVisualTemplateStatusAction} className="ml-auto">
                  <TemplateFields template={template} />
                  <input type="hidden" name="status" value={published ? "draft" : "published"} />
                  {published ? (
                    <Button type="submit" variant="secondary">Kullanımdan kaldır</Button>
                  ) : (
                    <Button type="submit" disabled={!canPublish}>Kullanıma al</Button>
                  )}
                </form>
              </div>
            </Card>
          </div>
          <Card title="Önizleme" className="lg:sticky lg:top-4" actions={editable ? <Link href={`/signatures/${template.id}/edit`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"><PenLine aria-hidden size={14} /> Düzenle</Link> : undefined}>
            <div className="overflow-hidden rounded-md border border-border bg-white">
              {previewHtml ? (
                <iframe title="İmza önizlemesi" sandbox="" className="h-64 w-full" srcDoc={`<!doctype html><html><body style="margin:16px;background:#fff">${previewHtml}</body></html>`} />
              ) : (
                <p className="py-16 text-center text-sm text-gray-500">Önizleme yok</p>
              )}
            </div>
            <p className="mt-2 text-xs text-text-muted">{me ? "Sizin bilgilerinizle gösteriliyor." : "Örnek bir kişiyle gösteriliyor."}</p>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            title={signatures.length ? "İmza bulunamadı" : "Henüz imza yok"}
            body={signatures.length ? "İmzalar sayfasından bir imza seçin." : "Önce bir imza oluşturun."}
            action={signatures.length
              ? <Link href="/signatures" className={linkButton}>İmzalar</Link>
              : <Link href="/signatures/new" className={linkButton}><Plus aria-hidden size={16} /> Yeni imza</Link>}
          />
        </Card>
      )}
    </>
  );
}
