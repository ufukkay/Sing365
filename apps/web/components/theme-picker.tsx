"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const storageKey = "sigwide-theme";
const changeEvent = "sigwide:theme-change";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Aydınlık", icon: Sun },
  { value: "dark", label: "Koyu", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
];

function getTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

function setTheme(theme: string | null) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    setTheme(event.newValue);
    onChange();
  }

  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "system");

  function choose(preference: Theme) {
    setTheme(preference);
    try {
      window.localStorage.setItem(storageKey, preference);
    } catch {
      // Selection still applies to the current page.
    }
    window.dispatchEvent(new Event(changeEvent));
  }

  return (
    <div
      role="group"
      aria-label="Tema seçimi"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => choose(value)}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
              active
                ? "bg-surface-raised text-accent shadow-xs"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
