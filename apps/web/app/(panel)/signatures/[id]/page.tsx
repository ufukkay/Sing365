import Link from "next/link";
import { notFound } from "next/navigation";
import { render } from "@sing365/render";
import { CopySignature } from "@/components/copy-signature";
import { PersonSwitcher } from "@/components/person-switcher";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";
import { FIELD_HELP } from "@/lib/html-template";
import { fieldValues } from "@/lib/signature";
import { parseVisualLayout, templateFieldLabels, visualFields, visualSampleSources } from "@/lib/visual-signature";
import { duplicateVisualTemplateAction } from "../actions";

export const metadata = { title: "İmza önizleme" };

export default async function SignaturePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const { tenantId, session } = await requirePanel();
  const { id } = await params;
  const sp = await searchParams;
  const template = await data.getTemplate(tenantId, id);
  if (!template) notFound();

  const people = await data.listPeople(tenantId);
  const pickUser = async () => {
    if (sp.user) return data.getUser(tenantId, sp.user);
    const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
    return me ?? (people[0] ? data.getUser(tenantId, people[0].id) : null);
  };
  const user = await pickUser();

  const preview = render(template.layout, user ? fieldValues(user) : visualSampleSources[0]?.values ?? {});
  const customLabels = templateFieldLabels(template.layout);
  const fieldName = (key: string) =>
    customLabels[key.toLowerCase()] ?? visualFields.find((f) => f.key === key)?.label ?? FIELD_HELP.find((f) => f.key === key)?.label ?? key;
  const visual = template.kind === "signature" && Boolean(parseVisualLayout(template.layout).layout);
  const editable = visual && template.status !== "archived";

  return (
    <>
      <PageHeader
        title={template.name}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {editable && (
              <Link
                href={`/signatures/${template.id}/edit`}
                className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover"
              >
                Düzenle
              </Link>
            )}
            {template.kind === "signature" && template.status !== "archived" && (
              <Link
                href={{ pathname: "/signatures/apply", query: { template: id } }}
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-3.5 text-sm font-semibold text-text hover:bg-surface"
              >
                Uygula
              </Link>
            )}
            {visual && (
              <form action={duplicateVisualTemplateAction}>
                <input type="hidden" name="id" value={id} />
                <Button variant="secondary" type="submit">
                  Çoğalt
                </Button>
              </form>
            )}
            <Link href="/signatures" className="px-2 text-sm font-medium text-text-muted hover:text-text">
              Tüm imzalar
            </Link>
          </div>
        }
      />

      <Card
        title="Önizleme"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <PersonSwitcher templateId={template.id} people={people} selectedId={user?.id} />
            {template.status === "published" ? (
              <Badge tone="success">Aktif</Badge>
            ) : (
              <Badge>{template.status === "archived" ? "Arşiv" : "Taslak"}</Badge>
            )}
          </div>
        }
      >
        <iframe
          title={`${template.name} önizlemesi`}
          srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:22px 24px;background:#fff;box-sizing:border-box">${preview.html}</body>`}
          sandbox=""
          className="h-80 w-full rounded-md border border-border bg-white"
        />
        <CopySignature html={preview.html} text={preview.text} />
        {preview.missing.length > 0 && (
          <p className="mt-3 text-xs text-text-muted">
            Boş olduğu için gizlenen alanlar: {preview.missing.map(fieldName).join(", ")}
          </p>
        )}
      </Card>
    </>
  );
}
