import Link from "next/link";
import { SignatureDesigner } from "@/components/signature-designer";
import { PageHeader } from "@/components/ui";
import { requirePanel } from "@/lib/context";
import { data } from "@/lib/data";
import { fieldValues } from "@/lib/signature";
import { visualFields, visualSampleSources } from "@/lib/visual-signature";
import { previewVisualTemplateAction, saveVisualTemplateAction } from "../actions";

export const metadata = { title: "Yeni imza" };

export default async function NewSignature() {
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
        actions={<Link href="/signatures" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Tüm imzalar</Link>}
      />
      <SignatureDesigner
        action={saveVisualTemplateAction} preview={previewVisualTemplateAction}
        sources={sources} fields={visualFields} existingNames={existingNames}
      />
    </>
  );
}
