import Link from "next/link";
import { Card, PageHeader, StatTile, Badge } from "@/components/ui";
import { data, SEED_TENANT_ID } from "@/lib/data";

export const metadata = { title: "Genel bakış" };

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso)) : "hiç";

export default async function Dashboard() {
  const [tenant, users, templates, sync] = await Promise.all([
    data.getTenant(SEED_TENANT_ID),
    data.listUsers(SEED_TENANT_ID),
    data.listTemplates(SEED_TENANT_ID),
    data.getSyncStatus(SEED_TENANT_ID),
  ]);
  const published = templates.filter((t) => t.status === "published").length;
  const mode = { client: "Outlook eklentisi", server: "Sunucu tarafı", both: "Eklenti + sunucu" }[tenant?.deploymentMode ?? "client"];

  return (
    <>
      <PageHeader title="Genel bakış" description="İmzaların durumu, dizin senkronu ve dağıtım tek bakışta." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Aktif posta kutusu" value={users.filter((u) => u.accountEnabled).length} note="faturalanan kişi sayısı" />
        <StatTile label="Yayındaki imza" value={published} note={`${templates.length - published} taslak`} />
        <StatTile label="Son senkron" value={<span className="text-base">{fmt(sync.finishedAt)}</span>} note={`${sync.usersChanged} kişi güncellendi`} />
        <StatTile label="Dağıtım" value={<span className="text-base">{mode}</span>} note={<Badge tone="accent">aktif</Badge>} />
      </div>
      <Card title="Sıradaki adımlar" className="mt-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <Link className="font-medium text-accent underline" href="/signatures">
              İmzaları önizleyin
            </Link>{" "}
            ve kimin hangi imzayı aldığını kontrol edin.
          </li>
          <li>Outlook eklentisini Microsoft 365 yönetim merkezi › Entegre uygulamalar üzerinden dağıtın.</li>
          <li>Kampanya bannerlarını planlayın (yakında).</li>
        </ol>
      </Card>
    </>
  );
}
