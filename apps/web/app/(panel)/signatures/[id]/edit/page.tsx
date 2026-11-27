import Link from "next/link";
import { notFound } from "next/navigation";
import { SignatureDesigner } from "@/components/signature-designer";
import { Card, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { fieldValues } from "@/lib/signature";
import { parseVisualLayout, visualFields, visualSampleSources } from "@/lib/visual-signature";
import { previewVisualTemplateAction, saveVisualTemplateAction } from "../../actions";

export const metadata = { title: "İmzayı düzenle" };

export default async function EditSignature({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, session } = await requirePanel();
  const { id } = await params;
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

  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  const sources = me ? [{ label: `Dizin · ${me.displayName}`, values: fieldValues(me) }, ...visualSampleSources] : visualSampleSources;

  return (
    <>
      {header}
      <SignatureDesigner
        initial={{ id, name: template.name, layout: parsed.layout, status: template.status, version: template.version }}
        action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
        sources={sources} fields={visualFields}
      />
    </>
  );
}
