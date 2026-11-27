import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const metadata = { title: "Kişiler" };

const PAGE = 500;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenantId } = await requirePanel();
  const q = (await searchParams).q?.trim() ?? "";
  const [users, groups, counts] = await Promise.all([
    data.listUsers(tenantId, { q, limit: PAGE }),
    data.listGroups(tenantId),
    data.countUsers(tenantId),
  ]);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.displayName ?? id;
  const n = (x: number) => x.toLocaleString("tr-TR");
  return (
    <>
      <PageHeader title="Kişiler" description="Microsoft Entra ID'den senkronlanan kişiler. Düzenlenen alanlar senkronda ezilmez." />
      <Card>
        <form method="get" role="search" className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="q" className="sr-only">Kişi ara</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Ad veya e-posta ile ara"
            className="h-9 w-full max-w-xs rounded-md border border-border-input bg-bg px-3 text-sm"
          />
          <Button type="submit" variant="secondary">Ara</Button>
          <p className="text-xs text-text-muted" aria-live="polite">
            {q
              ? `${n(users.length)}${users.length === PAGE ? "+" : ""} sonuç`
              : users.length < counts.total
                ? `${n(counts.total)} kişiden ilk ${n(users.length)} kişi gösteriliyor; diğerleri için arayın.`
                : `${n(counts.total)} kişi`}
          </p>
        </form>
        {users.length === 0 ? (
          q ? (
            <EmptyState title="Sonuç yok" body={`"${q}" ile eşleşen kişi bulunamadı.`} />
          ) : (
            <EmptyState title="Henüz kimse yok" body="Dizin senkronu tamamlanınca kişiler burada görünür." />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Ad</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Unvan</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Departman</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Gruplar</th>
                  <th scope="col" className="py-2 font-medium">Not</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const title = u.overrides.job_title ?? u.jobTitle;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{u.displayName}</div>
                        <div className="text-xs text-text-muted">{u.email}</div>
                      </td>
                      <td className="py-3 pr-4">{title || <span className="text-text-muted">boş</span>}</td>
                      <td className="py-3 pr-4">{u.department || <span className="text-text-muted">boş</span>}</td>
                      <td className="py-3 pr-4">{u.groupIds.map(groupName).join(", ")}</td>
                      <td className="py-3">{Object.keys(u.overrides).length > 0 && <Badge tone="accent">elle düzenlendi</Badge>}</td>
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
