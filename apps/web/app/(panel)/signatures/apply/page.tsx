import Link from "next/link";
import { ArrowLeft, Eye, LayoutTemplate, Plus } from "lucide-react";
import type { Rule } from "@sing365/rules";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import type { DirectoryGroup, Template } from "@/lib/data/types";
import { hasSignatureContent, simpleVisualRule } from "@/lib/visual-signature";
import { changeVisualTemplateStatusAction, configureTemplateApplicationAction } from "../actions";

export const metadata = { title: "İmza uygulama" };

const recipientLabels = {
  any: "Tüm alıcılar",
  internal: "Şirket içi",
  external: "Şirket dışı",
} satisfies Record<Rule["recipients"]["scope"], string>;

const modeLabels = {
  both: "Yeni iletiler ve yanıtlar",
  new: "Yalnız yeni iletiler",
  reply: "Yalnız yanıtlar",
} satisfies Record<Rule["appliesTo"], string>;

const notices = {
  saved: { text: "Uygulama kapsamı kaydedildi.", error: false },
  draft: { text: "Taslak kaydedildi. Uygulama kapsamını belirleyip imzayı aktifleştirebilirsiniz.", error: false },
  published: { text: "İmza aktifleştirildi.", error: false },
  unpublished: { text: "İmza taslağa alındı.", error: false },
  empty: { text: "İmzayı aktifleştirmek için tasarıma en az bir içerik bloğu ekleyin.", error: true },
  rule: { text: "İmzayı aktifleştirmek için önce etkin bir uygulama kuralı kaydedin.", error: true },
  conflict: { text: "Şablon başka bir oturumda değişti. Güncel kapsamı kontrol edip tekrar deneyin.", error: true },
  invalid: { text: "Şablonu ve uygulama ayarlarını kontrol edip tekrar deneyin.", error: true },
  group: { text: "Seçilen grup dizinde bulunamadı. Gönderenler alanını güncelleyin.", error: true },
  advanced: { text: "Bu şablon gelişmiş uygulama kuralları içeriyor. Mevcut kapsam aşağıda gösteriliyor.", error: true },
};

const linkButton = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm font-semibold text-text hover:bg-surface";
const selectClass = "h-10 w-full rounded-md border border-border-input bg-bg px-3 text-sm text-text";

function TemplateStatus({ status }: { status: Template["status"] }) {
  if (status === "published") return <Badge tone="success">Aktif</Badge>;
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
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 font-medium">
          Gönderenler
          <select name="senderGroup" className={selectClass} defaultValue={groupId}>
            <option value="">Tüm kullanıcılar</option>
            {missingGroup && <option value={groupId}>Dizinde bulunamayan mevcut grup</option>}
            {groups.map((group) => <option key={group.id} value={group.id}>{group.displayName}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 font-medium">
          Alıcılar
          <select name="recipientScope" className={selectClass} defaultValue={rule?.recipients.scope ?? "any"}>
            {Object.entries(recipientLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 font-medium">
          İleti türü
          <select name="appliesTo" className={selectClass} defaultValue={rule?.appliesTo ?? "both"}>
            {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
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
          <span id="signature-priority-help" className="text-xs font-normal text-text-muted">Küçük sayı önce uygulanır.</span>
        </label>
      </div>
      <label className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
        <input type="checkbox" name="enabled" value="on" defaultChecked={rule?.enabled ?? true} className="mt-0.5 size-4 accent-accent" />
        <span className="font-medium">
          Kuralı etkin tut
          <span className="block text-xs font-normal text-text-muted">Şablon aktifken eşleşen iletilere bu kural uygulanır.</span>
        </span>
      </label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {template.status === "published" && <p className="text-sm text-text-muted">Kaydedilen kapsam aktif imzaya hemen uygulanır.</p>}
        <Button type="submit" variant="secondary" className="ml-auto">Kapsamı kaydet</Button>
      </div>
    </form>
  );
}

function RuleSummary({ rules, groups }: { rules: Rule[]; groups: DirectoryGroup[] }) {
  const groupNames = new Map(groups.map((group) => [group.id, group.displayName]));

  return (
    <>
      <p className="mb-4 text-sm text-text-muted">Bu şablon gelişmiş uygulama kuralları kullanıyor.</p>
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
                <p className="font-medium">{senders.all ? "Tüm kullanıcılar" : targets.join(", ") || "Özel gönderen kapsamı"}</p>
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
  const [{ tenantId }, query] = await Promise.all([requirePanel(), searchParams]);
  const [templates, rules, groups] = await Promise.all([data.listTemplates(tenantId), data.listRules(tenantId), data.listGroups(tenantId)]);
  const signatures = templates.filter((template) => template.kind === "signature" && template.status !== "archived");
  const requested = typeof query.template === "string" ? signatures.find((template) => template.id === query.template) : undefined;
  const template = query.template ? requested : signatures.find((entry) => entry.status === "draft") ?? signatures[0];
  const notice = typeof query.notice === "string" && Object.hasOwn(notices, query.notice)
    ? notices[query.notice as keyof typeof notices]
    : query.template && !requested ? notices.invalid : undefined;
  const matchingRules = template ? rules.filter((rule) => rule.templateId === template.id) : [];
  const simpleRule = simpleVisualRule(matchingRules);
  const enabledRules = matchingRules.some((rule) => rule.enabled);

  return (
    <>
      <PageHeader
        title="İmza uygulama"
        actions={<Link href="/signatures" className={linkButton}><ArrowLeft aria-hidden size={16} /> İmzalar</Link>}
      />
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`mb-5 rounded-md border border-border px-4 py-3 ${notice.error ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}
        >
          {notice.text}
        </p>
      )}
      {signatures.length > 0 ? (
        <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Card title="Şablonlar" className="lg:sticky lg:top-4">
            <nav aria-label="Uygulanacak şablon">
              <ul className="max-h-64 space-y-1.5 overflow-y-auto p-1 lg:max-h-[65vh]">
                {signatures.map((entry) => {
                  const selected = entry.id === template?.id;
                  return (
                    <li key={entry.id}>
                      <Link
                        href={{ pathname: "/signatures/apply", query: { template: entry.id } }}
                        aria-current={selected ? "page" : undefined}
                        className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${selected ? "border-accent bg-accent-subtle text-accent" : "border-transparent text-text hover:bg-surface"}`}
                      >
                        <LayoutTemplate aria-hidden size={16} className="mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block break-words font-medium">{entry.name}</span>
                          <span className="mt-1 block"><TemplateStatus status={entry.status} /></span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Card>
          {template ? (
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 break-words text-xl font-semibold">{template.name}</h2>
                <Link href={`/signatures/${template.id}`} className={linkButton}><Eye aria-hidden size={16} /> Önizle</Link>
              </div>
              <Card title="Uygulama kapsamı">
                {simpleRule || matchingRules.length === 0
                  ? <ScopeForm template={template} groups={groups} rule={simpleRule} />
                  : <RuleSummary rules={matchingRules} groups={groups} />}
              </Card>
              <Card title="Yayın durumu" actions={<TemplateStatus status={template.status} />}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-md text-sm text-text-muted">
                    {template.status === "draft" && !hasSignatureContent(template.layout) ? "Aktifleştirmek için imza tasarımına içerik ekleyin."
                      : !enabledRules ? "İmzanın eşleşen iletilere eklenmesi için etkin bir uygulama kuralı gerekir."
                      : template.status === "published" ? "İmza, etkin kurallarla eşleşen iletilere eklenir."
                      : "Aktifleştirdiğinizde imza, seçilen kapsamla eşleşen iletilere eklenir."}
                  </p>
                  <form action={changeVisualTemplateStatusAction} className="ml-auto">
                    <TemplateFields template={template} />
                    <input type="hidden" name="status" value={template.status === "published" ? "draft" : "published"} />
                    {template.status === "published" ? (
                      <Button type="submit" variant="secondary">Taslağa al</Button>
                    ) : (
                      <Button type="submit" disabled={!enabledRules || !hasSignatureContent(template.layout)}>Aktifleştir</Button>
                    )}
                  </form>
                </div>
              </Card>
            </div>
          ) : (
            <Card><EmptyState title="Şablon seçin" body="Uygulama kapsamını açmak için listeden bir şablon seçin." action={null} /></Card>
          )}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Uygulanabilir şablon yok"
            body="Önce bir imza şablonu oluşturun."
            action={<Link href="/signatures/new" className={linkButton}><Plus aria-hidden size={16} /> Yeni imza</Link>}
          />
        </Card>
      )}
    </>
  );
}
