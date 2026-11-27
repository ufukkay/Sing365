import Link from "next/link";
import { Card, PageHeader, StatTile, Badge } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const metadata = { title: "Genel bakış" };

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso)) : "hiç";

export default async function Dashboard() {
  const { tenantId } = await requirePanel();
  const [tenant, counts, templates, sync] = await Promise.all([
    data.getTenant(tenantId),
    data.countUsers(tenantId),
    data.listTemplates(tenantId),
    data.getSyncStatus(tenantId),
  ]);
  const published = templates.filter((t) => t.status === "published").length;
  const mode = tenant?.relayKeySet ? "Sunucu tarafı" : "Kurulmadı";

  return (
    <>
      <PageHeader title="Genel bakış" description="İmzaların durumu, dizin senkronu ve dağıtım tek bakışta." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Aktif posta kutusu" value={counts.enabled.toLocaleString("tr-TR")} note="faturalanan kişi sayısı" />
        <StatTile label="Yayındaki imza" value={published} note={`${templates.length - published} taslak`} />
        <StatTile label="Son senkron" value={<span className="text-base">{fmt(sync.finishedAt)}</span>} note={`${sync.usersChanged} kişi güncellendi`} />
        <StatTile
          label="Dağıtım"
          value={<span className="text-base">{mode}</span>}
          note={tenant?.relayKeySet ? <Badge tone="accent">röle anahtarı var</Badge> : <Link className="text-accent underline" href="/exchange">Exchange bağlantısı</Link>}
        />
      </div>
      <Card title="Sıradaki adımlar" className="mt-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <Link className="font-medium text-accent underline" href="/signatures">
              İmzaları önizleyin
            </Link>{" "}
            ve kimin hangi imzayı aldığını kontrol edin.
          </li>
          <li>
            <Link className="font-medium text-accent underline" href="/exchange">
              Exchange bağlantısını kurun
            </Link>{" "}
            ve imzayı önce bir test grubunda deneyin.
          </li>
          <li>Kampanya bannerlarını planlayın (yakında).</li>
        </ol>
      </Card>
    </>
  );
}
