import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const metadata = { title: "Kişiler" };

const PAGE = 500;
const empty = <span className="text-text-muted">—</span>;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenantId } = await requirePanel();
  const q = (await searchParams).q?.trim() ?? "";
  const [users, counts] = await Promise.all([
    data.listUsers(tenantId, { q, limit: PAGE }),
    data.countUsers(tenantId),
  ]);
  const n = (x: number) => x.toLocaleString("tr-TR");

  return (
    <>
      <PageHeader title="Kişiler" />
      <Card>
        <form method="get" role="search" className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="q" className="sr-only">
            Kişi ara
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Ad veya e-posta ara…"
            className="h-9 w-full max-w-xs rounded-md border border-border-input bg-bg px-3 text-sm text-text"
          />
          <Button type="submit" variant="secondary">
            Ara
          </Button>
          <p className="text-xs text-text-muted" aria-live="polite">
            {q
              ? `${n(users.length)}${users.length === PAGE ? "+" : ""} sonuç`
              : users.length < counts.enabled
                ? `${n(counts.enabled)} kişiden ilk ${n(users.length)} kişi`
                : `${n(counts.enabled)} kişi`}
          </p>
        </form>

        {users.length === 0 ? (
          q ? (
            <EmptyState title="Sonuç yok" body={`"${q}" ile eşleşen kişi bulunamadı.`} />
          ) : (
            <EmptyState title="Henüz kimse yok" body="Entra ID eşitlemesi tamamlanınca kişiler burada görünür." />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-text-muted">
                <tr>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    Kişi
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    İş unvanı
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    Departman
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    Şirket adı
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    Ofis konumu
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    İş telefonu
                  </th>
                  <th scope="col" className="py-2.5 font-medium">
                    Cep telefonu
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const title = u.overrides.job_title ?? u.jobTitle;
                  const dept = u.overrides.department ?? u.department;
                  const company = u.overrides.company_name ?? u.companyName;
                  const office = u.overrides.office_location ?? u.officeLocation;
                  const workPhone = u.overrides.business_phone ?? u.businessPhone;
                  const mobile = u.overrides.mobile_phone ?? u.mobilePhone;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-text">{u.displayName}</div>
                        <div className="text-xs text-text-muted">{u.email}</div>
                      </td>
                      <td className="py-3 pr-4">{title || empty}</td>
                      <td className="py-3 pr-4">{dept || empty}</td>
                      <td className="py-3 pr-4">{company || empty}</td>
                      <td className="py-3 pr-4">{office || empty}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{workPhone || empty}</td>
                      <td className="py-3 whitespace-nowrap">{mobile || empty}</td>
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
