import { CircleCheck } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";
import { data, SEED_TENANT_ID } from "@/lib/data";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // TODO(replica-backend): the tenant comes from the signed-in admin's session.
  const tenant = await data.getTenant(SEED_TENANT_ID);
  const sync = await data.getSyncStatus(SEED_TENANT_ID);
  return (
    <div className="grid min-h-screen grid-rows-[56px_auto_1fr] lg:grid-rows-[56px_1fr] lg:grid-cols-[248px_1fr]">
      <header className="col-span-full flex items-center gap-4 border-b border-border bg-bg px-4">
        <a href="#main" className="sr-only focus:not-sr-only">
          İçeriğe geç
        </a>
        <span className="text-lg font-bold text-accent">Sing365</span>
        <span className="truncate text-sm text-text-muted">{tenant?.name}</span>
        <span className="ml-auto">
          {sync.state === "succeeded" ? (
            <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>
              Dizin senkron
            </Badge>
          ) : (
            <Badge tone="warning">Senkron bekliyor</Badge>
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
