"use client";

// ChecklistClientPicker.tsx
//
// Multi-select client picker for a coach reminder. A searchable checkbox list
// whose selection is mirrored into hidden <input name="clientIds"> elements, so
// the host's uncontrolled FormData submit reads every selected uid via
// formData.getAll("clientIds") — even ones filtered out of the visible list.

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChecklistClientOption {
  uid: string;
  displayName: string;
}

export function ChecklistClientPicker({
  clients,
  defaultSelected = [],
}: {
  clients: ChecklistClientOption[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaultSelected),
  );
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [clients, search]);

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="grid gap-2">
      {/* Carries the selection through the uncontrolled FormData submit,
          independent of the search filter. */}
      {[...selected].map((uid) => (
        <input key={uid} type="hidden" name="clientIds" value={uid} />
      ))}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar cliente…"
        className="h-9"
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-input">
        {clients.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No hay clientes.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            Sin resultados.
          </p>
        ) : (
          filtered.map((c) => {
            const checked = selected.has(c.uid);
            return (
              <button
                type="button"
                key={c.uid}
                onClick={() => toggle(c.uid)}
                aria-pressed={checked}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                  checked && "bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {checked ? <Check className="size-3" /> : null}
                </span>
                <span className="truncate">{c.displayName}</span>
              </button>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "Sin cliente"
          : selected.size === 1
            ? "1 cliente seleccionado"
            : `${selected.size} clientes seleccionados`}
      </p>
    </div>
  );
}
