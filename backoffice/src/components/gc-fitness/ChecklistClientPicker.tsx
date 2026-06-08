"use client";

// ChecklistClientPicker.tsx
//
// Multi-select client picker for a coach reminder. A searchable checkbox list
// whose selection is mirrored into hidden <input name="clientIds"> elements, so
// the host's uncontrolled FormData submit reads every selected uid via
// formData.getAll("clientIds") — even ones filtered out of the visible list.

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientAvatar } from "@/components/gc-fitness/ClientAvatar";
import { cn } from "@/lib/utils";

export interface ChecklistClientOption {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

const CLIENT_PALETTE = [
  { dot: "bg-amber-500" },
  { dot: "bg-sky-500" },
  { dot: "bg-emerald-500" },
  { dot: "bg-violet-500" },
  { dot: "bg-rose-500" },
  { dot: "bg-orange-500" },
  { dot: "bg-cyan-500" },
  { dot: "bg-indigo-500" },
];

function dotClass(clients: ChecklistClientOption[], uid: string): string {
  const index = clients.findIndex((client) => client.uid === uid);
  return CLIENT_PALETTE[Math.max(0, index) % CLIENT_PALETTE.length].dot;
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

  function selectAll() {
    setSelected(new Set(clients.map((client) => client.uid)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <div className="grid gap-3">
      {/* Carries the selection through the uncontrolled FormData submit,
          independent of the search filter. */}
      {[...selected].map((uid) => (
        <input key={uid} type="hidden" name="clientIds" value={uid} />
      ))}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="h-11 sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={selectAll}
            disabled={selected.size === clients.length}
          >
            Marcar todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={clearAll}
            disabled={selected.size === 0}
          >
            Limpiar
          </Button>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-[1.25rem] border border-border bg-card p-3">
        {clients.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No hay clientes.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            Sin resultados.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filtered.map((c) => {
              const checked = selected.has(c.uid);
              return (
                <button
                  type="button"
                  key={c.uid}
                  onClick={() => toggle(c.uid)}
                  aria-pressed={checked}
                  className={cn(
                    "group/chip inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition-all",
                    checked
                      ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <ClientAvatar
                      name={c.displayName}
                      photoURL={c.photoURL}
                      size="sm"
                    />
                    {checked ? (
                      <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-primary-foreground text-primary ring-2 ring-primary">
                        <Check className="size-2.5" strokeWidth={3.5} />
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      dotClass(clients, c.uid),
                      checked && "ring-1 ring-primary-foreground/60",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{c.displayName}</span>
                </button>
              );
            })}
          </div>
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
