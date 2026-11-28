"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PenLine, Plug, Send, Users } from "lucide-react";
import { cx } from "./ui";

const nav = [
  { href: "/", label: "Genel bakış", icon: LayoutDashboard },
  { href: "/signatures", label: "İmzalar", icon: PenLine },
  { href: "/signatures/apply", label: "İmza uygulama", icon: Send },
  { href: "/users", label: "Kişiler", icon: Users },
  { href: "/exchange", label: "Exchange bağlantısı", icon: Plug },
];

export function Sidebar({ vertical = false }: { vertical?: boolean }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Ana menü"
      className={vertical ? "flex flex-col gap-1 p-3" : "flex flex-wrap items-center gap-1"}
    >
      {nav.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? path === "/"
            : path === href || (path.startsWith(`${href}/`) && !(href === "/signatures" && path === "/signatures/apply"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap",
              vertical && "px-3 py-2 text-sm",
              active ? "bg-accent-subtle text-accent" : "text-text-muted hover:bg-surface hover:text-text",
            )}
          >
            <Icon aria-hidden className="size-3.5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
