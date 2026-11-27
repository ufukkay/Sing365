"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Megaphone, PenLine, Plug, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const nav = [
  { href: "/", label: "Genel bakış", icon: LayoutDashboard },
  { href: "/signatures", label: "İmzalar", icon: PenLine },
  { href: "/users", label: "Kişiler", icon: Users },
  { href: "/exchange", label: "Exchange bağlantısı", icon: Plug },
  { href: "/campaigns", label: "Kampanyalar", icon: Megaphone, soon: true },
  { href: "/analytics", label: "Analiz", icon: BarChart3, soon: true },
  { href: "/settings", label: "Ayarlar", icon: Settings, soon: true },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-1 p-3">
      {nav.map(({ href, label, icon: Icon, soon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        if (soon)
          return (
            <span key={href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-muted" aria-disabled="true">
              <Icon aria-hidden className="size-4" />
              {label}
              <span className="ml-auto text-xs">yakında</span>
            </span>
          );
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-accent-subtle text-accent" : "text-text hover:bg-surface",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
