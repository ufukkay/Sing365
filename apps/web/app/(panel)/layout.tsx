import Link from "next/link";
import { CircleCheck, LogOut, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemePicker } from "@/components/theme-picker";
import { Badge } from "@/components/ui";
import { data } from "@/lib/data";
import { requirePanel } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, session } = await requirePanel();
  const tenant = await data.getTenant(tenantId);
  const sync = await data.getSyncStatus(tenantId);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex min-h-13 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-4 py-2">
        <a href="#main" className="sr-only focus:not-sr-only">
          İçeriğe geç
        </a>
        <Link href="/" className="shrink-0 text-base font-bold tracking-tight text-accent">
          Sigwide
        </Link>
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tenant?.name && (
            <span className="hidden max-w-[200px] truncate text-xs font-medium text-text-muted lg:inline">
              {tenant.name}
            </span>
          )}
          <ThemePicker />
          {sync.state === "succeeded" ? (
            <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>
              Dizin güncel
            </Badge>
          ) : sync.state === "failed" ? (
            <Badge tone="danger">Eşitleme hatası</Badge>
          ) : (
            <Badge tone="warning">Eşitleme bekliyor</Badge>
          )}
          {session && (
            <form action="/api/sync" method="post">
              <button type="submit" title="Dizini şimdi eşitle" aria-label="Dizini şimdi eşitle" className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-accent">
                <RefreshCw aria-hidden className="size-3.5" />
              </button>
            </form>
          )}
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          {session && (
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-text" title={`${session.email} oturumunu kapat`}>
                <LogOut aria-hidden className="size-3.5" /> Çıkış
              </button>
            </form>
          )}
        </div>
      </header>
      <details className="border-b border-border bg-bg md:hidden">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Menü</summary>
        <Sidebar vertical />
      </details>
      <main id="main" className="sigwide-panel-canvas flex-1 min-w-0 bg-surface px-4 py-4 sm:px-5">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
