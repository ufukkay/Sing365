import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const metadata = { title: "İmzalar" };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso));

export default async function SignaturesPage() {
  const { tenantId } = await requirePanel();
  const [templates, rules] = await Promise.all([data.listTemplates(tenantId), data.listRules(tenantId)]);
  const signatures = templates.filter((t) => t.kind === "signature");
  const priorityOf = (id: string) => Math.min(...rules.filter((r) => r.templateId === id).map((r) => r.priority));

  return (
    <>
      <PageHeader
        title="İmzalar"
        description="Kurallar öncelik sırasıyla çalışır: bir gönderen için eşleşen ilk kural imzayı belirler."
      />
      <Card>
        {signatures.length === 0 ? (
          <EmptyState title="Henüz imza yok" body="İlk imzanızı oluşturun; dizindeki bilgiler otomatik dolar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Ad</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Durum</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Öncelik</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Sürüm</th>
                  <th scope="col" className="py-2 font-medium">Son değişiklik</th>
                </tr>
              </thead>
              <tbody>
                {[...signatures]
                  .sort((a, b) => priorityOf(a.id) - priorityOf(b.id))
                  .map((t) => {
                    const p = priorityOf(t.id);
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4">
                          <Link href={`/signatures/${t.id}`} className="font-medium text-accent underline-offset-2 hover:underline">
                            {t.name}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          {t.status === "published" ? <Badge tone="success">Yayında</Badge> : <Badge>Taslak</Badge>}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{Number.isFinite(p) ? p : "kural yok"}</td>
                        <td className="py-3 pr-4 tabular-nums">v{t.version}</td>
                        <td className="py-3 text-text-muted">{fmt(t.updatedAt)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
