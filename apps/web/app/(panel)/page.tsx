import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const metadata = { title: "Genel bakış" };

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso))
    : "Henüz yok";

export default async function Dashboard() {
  const { tenantId } = await requirePanel();
  const [tenant, counts, templates, sync] = await Promise.all([
    data.getTenant(tenantId),
    data.countUsers(tenantId),
    data.listTemplates(tenantId),
    data.getSyncStatus(tenantId),
  ]);
  const signatures = templates.filter((t) => t.kind === "signature" && t.status !== "archived");
  const published = signatures.filter((t) => t.status === "published").length;
  const drafts = signatures.filter((t) => t.status === "draft").length;

  return (
    <>
      <PageHeader
        title="Genel bakış"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/signatures/apply"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-raised px-3.5 text-sm font-semibold text-text hover:bg-surface"
            >
              <Send aria-hidden className="size-4 text-accent" />
              İmza uygula
            </Link>
            <Link
              href="/signatures/new"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              <Plus aria-hidden className="size-4" />
              Yeni imza
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Kişiler" value={counts.enabled.toLocaleString("tr-TR")} note="Entra ID aktif kullanıcı" />
        <StatTile label="Aktif imza" value={published} note={drafts > 0 ? `${drafts} taslak` : "Taslak yok"} />
        <StatTile label="Son eşitleme" value={<span className="text-base">{fmt(sync.finishedAt)}</span>} />
        <StatTile
          label="Exchange bağlantısı"
          value={<span className="text-base">{tenant?.relayKeySet ? "Bağlı" : "Bekliyor"}</span>}
          note={
            tenant?.relayKeySet ? undefined : (
              <Link className="text-accent underline" href="/exchange">
                Kurulumu aç
              </Link>
            )
          }
        />
      </div>
    </>
  );
}
