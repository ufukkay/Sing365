import Link from "next/link";
import { FieldHelp } from "@/components/field-help";
import { HtmlTemplateForm } from "@/components/html-template-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { fieldValues } from "@/lib/signature";
import { saveHtmlTemplateAction } from "../actions";

export const metadata = { title: "HTML'den imza" };

export default async function NewHtmlSignature() {
  const { tenantId, session } = await requirePanel();
  const me = session ? await data.findUserByEmail(tenantId, session.email) : null;
  return (
    <>
      <PageHeader
        title="HTML'den imza oluştur"
        description="Kullandığınız imza HTML'ini yapıştırın; kişiye göre değişen yerlere alan yazın. Herkese, dizindeki kendi bilgileriyle uygulanır."
        actions={
          <Link href="/signatures" className="text-sm font-medium text-accent underline">
            Tüm imzalar
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <HtmlTemplateForm action={saveHtmlTemplateAction} />
        </Card>
        <FieldHelp values={me ? fieldValues(me) : null} />
      </div>
    </>
  );
}
