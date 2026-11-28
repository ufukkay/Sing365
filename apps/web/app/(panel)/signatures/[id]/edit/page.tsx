import Link from "next/link";
import { notFound } from "next/navigation";
import { QuickSignatureEditor } from "@/components/quick-signature-editor";
import { SignatureDesigner } from "@/components/signature-designer";
import { Card, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { fieldValues } from "@/lib/signature";
import { quickConfigOf } from "@/lib/quick-signature";
import { parseVisualLayout, visualFields, visualSampleSources } from "@/lib/visual-signature";
import { previewVisualTemplateAction, saveVisualTemplateAction } from "../../actions";

export const metadata = { title: "İmzayı düzenle" };

export default async function EditSignature({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { tenantId, session } = await requirePanel();
  const { id } = await params;
  const advanced = (await searchParams).mode === "advanced";
  const template = await data.getTemplate(tenantId, id);
  if (template?.kind !== "signature" || template.status === "archived") notFound();
  const parsed = parseVisualLayout(template.layout);
  const header = (
    <PageHeader
      title={`${template.name} · Düzenle`}
      actions={<Link href={`/signatures/${id}`} className="text-sm font-medium text-accent underline-offset-4 hover:underline">Önizlemeye dön</Link>}
    />
  );
  if (!parsed.layout) {
    return (
      <>
        {header}
        <Card title="Bu şablon eski düzenleyiciyle oluşturuldu">
          <Link href="/signatures/new" className="text-sm font-medium text-accent underline">Görsel şablon oluştur</Link>
        </Card>
      </>
    );
  }

  const [me, templates] = await Promise.all([
    session ? data.findUserByEmail(tenantId, session.email) : Promise.resolve(null),
    data.listTemplates(tenantId),
  ]);
  const existingNames = templates.filter((t) => t.kind === "signature" && t.id !== id).map((t) => t.name);
  const sources = me ? [{ label: `Dizin · ${me.displayName}`, values: fieldValues(me) }, ...visualSampleSources] : visualSampleSources;

  const quick = advanced ? null : quickConfigOf(parsed.layout);
  if (quick) {
    return (
      <>
        {header}
        <QuickSignatureEditor
          initial={{ id, name: template.name, config: quick, status: template.status, version: template.version }}
          action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
          sources={sources} advancedHref={`/signatures/${id}/edit?mode=advanced`}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {advanced && quickConfigOf(parsed.layout) && (
        <p className="mb-3 rounded-md border border-border bg-surface-raised p-3 text-sm text-text-muted">
          Gelişmiş düzenleyicide kaydederseniz bu imza artık hızlı düzenleyicide açılmaz.{" "}
          <Link href={`/signatures/${id}/edit`} className="font-medium text-accent underline">Hızlı düzenleyiciye dön</Link>
        </p>
      )}
      <SignatureDesigner
        initial={{ id, name: template.name, layout: parsed.layout, status: template.status, version: template.version }}
        action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
        sources={sources} fields={visualFields} existingNames={existingNames}
      />
    </>
  );
}
