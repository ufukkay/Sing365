import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Card, PageHeader, StatTile } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";
import { buildSignature } from "@/lib/signature";

export const metadata = { title: "Genel bakış" };

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso))
    : "Henüz yok";

export default async function Dashboard() {
  const { tenantId, session } = await requirePanel();
  const [tenant, counts, templates, sync] = await Promise.all([
    data.getTenant(tenantId),
    data.countUsers(tenantId),
    data.listTemplates(tenantId),
    data.getSyncStatus(tenantId),
  ]);
  const signatures = templates.filter((t) => t.kind === "signature" && t.status !== "archived");
  const published = signatures.filter((t) => t.status === "published");
  const drafts = signatures.filter((t) => t.status === "draft").length;

  // The signature the signed-in admin's own mail to an outside address would get right now.
  const mine = session
    ? await buildSignature(data, { tenantId, from: session.email, mode: "new", recipients: [] }).catch(() => null)
    : null;
  const mineName = mine?.ok && mine.templateId ? templates.find((t) => t.id === mine.templateId)?.name : undefined;

  const steps = [
    { done: sync.state === "succeeded" && counts.enabled > 0, title: "Microsoft 365 dizini bağlandı", body: `${counts.enabled.toLocaleString("tr-TR")} çalışan eşitlendi.`, href: "/users", cta: "Kişileri gör" },
    { done: signatures.length > 0, title: "İlk imzanızı oluşturun", body: "Hazır örneklerden birini seçip logonuzu ve renginizi ekleyin.", href: "/signatures/new", cta: "İmza oluştur" },
    { done: published.length > 0, title: "İmzayı kullanıma alın", body: "Hangi çalışanların postalarına ekleneceğini seçin.", href: "/signatures", cta: "İmzalara git" },
    { done: Boolean(tenant?.relayKeySet), title: "Exchange bağlantısını kurun", body: "Telefon dahil tüm cihazlardan giden postalara imza eklenir.", href: "/exchange", cta: "Kurulumu aç" },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <>
      <PageHeader
        title="Genel bakış"
        actions={
          <Link href="/signatures/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">
            <Plus aria-hidden className="size-4" /> Yeni imza
          </Link>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={remaining ? `Kurulum: ${steps.length - remaining}/${steps.length} tamam` : "Kurulum tamam"}>
          <ol className="grid gap-1">
            {steps.map((s, i) => (
              <li key={s.title} className={`flex items-start gap-3 rounded-md px-2 py-2.5 ${s === next ? "bg-accent-subtle" : ""}`}>
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    s.done ? "bg-success text-on-accent" : s === next ? "bg-accent text-on-accent" : "border border-border text-text-muted"
                  }`}
                >
                  {s.done ? <Check aria-hidden className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${s.done ? "text-text-muted" : "text-text"}`}>{s.title}</span>
                  {!s.done || s === steps[0] ? <span className="block text-xs text-text-muted">{s.body}</span> : null}
                </span>
                {!s.done && (
                  <Link href={s.href} className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${s === next ? "text-accent" : "text-text-muted"} hover:underline`}>
                    {s.cta} <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Sizin imzanız"
          actions={mine?.ok && mine.templateId ? <Link href={`/signatures/${mine.templateId}`} className="text-xs font-semibold text-accent hover:underline">{mineName}</Link> : undefined}
        >
          {mine?.ok && mine.html ? (
            <>
              <div className="overflow-hidden rounded-md border border-border bg-white">
                <iframe title="Sizin imzanız" sandbox="" className="h-52 w-full" srcDoc={`<!doctype html><html><body style="margin:16px;background:#fff">${mine.html}</body></html>`} />
              </div>
              <p className="mt-2 text-xs text-text-muted">Şirket dışına yeni bir posta gönderdiğinizde eklenen imza.</p>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-text-muted">
              {!session ? "Oturum açtığınızda burada kendi imzanızı görürsünüz." : published.length ? "Kullanımdaki imzalar sizin postalarınıza uygulanmıyor." : "Henüz kullanımda imza yok."}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Çalışanlar" value={counts.enabled.toLocaleString("tr-TR")} note="Microsoft 365'ten eşitlenen" />
        <StatTile label="Kullanımdaki imzalar" value={published.length} note={drafts > 0 ? `${drafts} taslak` : "Taslak yok"} />
        <StatTile label="Son eşitleme" value={<span className="text-base">{fmt(sync.finishedAt)}</span>} note="30 dakikada bir otomatik" />
        <StatTile label="Exchange bağlantısı" value={<span className="text-base">{tenant?.relayKeySet ? "Kurulu" : "Kurulmadı"}</span>} />
      </div>
    </>
  );
}
