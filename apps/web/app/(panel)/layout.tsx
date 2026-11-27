import { CircleCheck } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, session } = await requirePanel();
  const tenant = await data.getTenant(tenantId);
  const sync = await data.getSyncStatus(tenantId);
  return (
    <div className="grid min-h-screen grid-rows-[56px_auto_1fr] lg:grid-rows-[56px_1fr] lg:grid-cols-[248px_1fr]">
      <header className="col-span-full flex items-center gap-4 border-b border-border bg-bg px-4">
        <a href="#main" className="sr-only focus:not-sr-only">
          İçeriğe geç
        </a>
        <span className="text-lg font-bold text-accent">Sigwide</span>
        <span className="truncate text-sm text-text-muted">{tenant?.name}</span>
        <span className="ml-auto flex items-center gap-2">
          {session && (
            <form action="/api/sync" method="post">
              <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-subtle">
                Şimdi senkronla
              </button>
            </form>
          )}
          {sync.state === "succeeded" ? (
            <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>
              Dizin senkron
            </Badge>
          ) : sync.state === "failed" ? (
            <Badge tone="danger">Senkron hatası</Badge>
          ) : (
            <Badge tone="warning">Senkron bekliyor</Badge>
          )}
          {session && (
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface" title={session.email}>
                Çıkış
              </button>
            </form>
          )}
        </span>
      </header>
      <details className="border-b border-border bg-bg lg:hidden">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Menü</summary>
        <Sidebar />
      </details>
      <aside className="hidden border-r border-border bg-bg lg:block">
        <Sidebar />
      </aside>
      <main id="main" className="min-w-0 bg-surface px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
