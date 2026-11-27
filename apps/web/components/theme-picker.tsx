"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const storageKey = "sigwide-theme";
const changeEvent = "sigwide:theme-change";

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
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <label className="relative inline-flex shrink-0 items-center">
      <span className="sr-only">Tema</span>
      <Icon aria-hidden="true" className="pointer-events-none absolute left-2.5 size-4 text-accent" />
      <select
        className="h-9 rounded-md border border-border bg-surface-raised pl-8 pr-2 text-xs font-semibold text-text transition-colors hover:border-border-input"
        value={theme}
        onChange={(event) => {
          const preference = event.currentTarget.value;
          setTheme(preference);
          try {
            window.localStorage.setItem(storageKey, preference);
          } catch {
            // The selection still applies to the current page.
          }
          window.dispatchEvent(new Event(changeEvent));
        }}
      >
        <option value="system">Sistem</option>
        <option value="light">Aydınlık</option>
        <option value="dark">Koyu</option>
      </select>
    </label>
  );
}
