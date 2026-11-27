import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { HtmlTemplateForm } from "@/components/html-template-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { htmlOf } from "@/lib/html-template";
import { fieldValues } from "@/lib/signature";
import { saveHtmlTemplateAction } from "../../actions";

export const metadata = { title: "İmzayı düzenle" };

export default async function EditHtmlSignature({ params }: { params: Promise<{ id: string }> }) {
  const { tenantId, session } = await requirePanel();
  const { id } = await params;
  const template = await data.getTemplate(tenantId, id);
  const html = template ? htmlOf(template) : null;
  if (!template || html === null) notFound();
  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  return (
    <>
      <PageHeader
        title={`${template.name}: düzenle`}
        description="Kaydettiğinizde sürüm numarası artar; Outlook eklentisi yeni sürümü bir sonraki e-postada alır."
        actions={
          <Link href={`/signatures/${template.id}`} className="text-sm font-medium text-accent underline">
            Önizlemeye dön
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <HtmlTemplateForm action={saveHtmlTemplateAction} initial={{ id: template.id, name: template.name, html }} />
        </Card>
        <FieldHelp values={me ? fieldValues(me) : null} />
      </div>
    </>
  );
}
