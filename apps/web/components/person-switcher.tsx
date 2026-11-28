"use client";

import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

export function PersonSwitcher({
  templateId,
  people,
  selectedId,
}: {
  templateId: string;
  people: { id: string; displayName: string; email: string }[];
  selectedId?: string;
}) {
  const router = useRouter();
  if (people.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs text-text-muted">
      <UserRound aria-hidden className="size-3.5 shrink-0" />
      <select
        aria-label="Önizleme kişisi"
        value={selectedId ?? people[0]?.id ?? ""}
        onChange={(e) => router.replace(`/signatures/${templateId}?user=${encodeURIComponent(e.target.value)}`)}
        className="h-8 max-w-[220px] bg-transparent text-xs font-medium text-text focus:outline-none"
      >
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
