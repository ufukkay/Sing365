import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { data, SEED_TENANT_ID } from "@/lib/data";

export const metadata = { title: "Kişiler" };

export default async function UsersPage() {
  const [users, groups] = await Promise.all([data.listUsers(SEED_TENANT_ID), data.listGroups(SEED_TENANT_ID)]);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.displayName ?? id;
  return (
    <>
      <PageHeader title="Kişiler" description="Microsoft Entra ID'den senkronlanan kişiler. Düzenlenen alanlar senkronda ezilmez." />
      <Card>
        {users.length === 0 ? (
          <EmptyState title="Henüz kimse yok" body="Dizin senkronu tamamlanınca kişiler burada görünür." />
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
