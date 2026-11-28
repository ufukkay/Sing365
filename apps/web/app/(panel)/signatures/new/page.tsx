import Link from "next/link";
import { QuickSignatureEditor } from "@/components/quick-signature-editor";
import { publicAssetOrigin } from "@/lib/public-origin";
import { QUICK_TEMPLATES } from "@/lib/quick-signature";
import { SignatureDesigner } from "@/components/signature-designer";
import { PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { fieldValues } from "@/lib/signature";
import { visualFields, visualSampleSources } from "@/lib/visual-signature";
import { previewPeopleAction, previewVisualTemplateAction, saveVisualTemplateAction } from "../actions";

export const metadata = { title: "Yeni imza" };

export default async function NewSignature({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  // A ready-made template (chosen on the signatures page) opens the quick editor; otherwise the full designer.
  const wanted = (await searchParams).template;
  const template = QUICK_TEMPLATES.find((t) => t.id === wanted);
  const advanced = !template;
  const { tenantId, session } = await requirePanel();
  const [me, templates] = await Promise.all([
    session ? data.findUserByEmail(tenantId, session.email) : Promise.resolve(null),
    data.listTemplates(tenantId),
  ]);
  const existingNames = templates.filter((t) => t.kind === "signature").map((t) => t.name);
  const sources = me ? [{ label: `Dizin · ${me.displayName}`, values: fieldValues(me) }, ...visualSampleSources] : visualSampleSources;

  return (
    <>
      <PageHeader
        title="Yeni imza"
        actions={
          <div className="flex items-center gap-4">
            {advanced && <Link href="/signatures#sablonlar" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Hazır şablonla başla</Link>}
            <Link href="/signatures" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Tüm imzalar</Link>
          </div>
        }
      />
      {advanced ? (
        <SignatureDesigner
          action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
          sources={sources} fields={visualFields} existingNames={existingNames}
        />
      ) : (
        <QuickSignatureEditor
          action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
          sources={sources} artOrigin={publicAssetOrigin()} findPeople={previewPeopleAction} advancedHref="/signatures/new" startTemplate={template?.id}
        />
      )}
    </>
  );
}
