// ClientChartsSection.tsx — every chart on a client profile, in one place, with
// a switchboard.
//
// They used to be scattered: two in the profile's widget grid, two more behind a
// "Ver progreso por ejercicio" button on a separate route, and personal records
// somewhere below the fold. A coach comparing tonnage against weekly sets had to
// change pages. Now it is one section and the route is gone.
//
// WHY THE NODES COME IN AS PROPS
// ------------------------------
// Each chart is an async Server Component doing its own Firestore read. This
// component is a client one (it owns the popover), so it cannot import them —
// they arrive already-rendered from page.tsx as `node`.
//
// And `node` is NULL for a hidden chart, because page.tsx skipped rendering it
// entirely: the visibility preference lives in a cookie precisely so the server
// can decline to run the query. Hiding a chart here has to be worth something,
// and what it is worth is the read.

"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LineChart, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  CLIENT_CHARTS_COOKIE,
  CLIENT_CHARTS_COOKIE_MAX_AGE,
  serializeHiddenCharts,
  toggleChartVisibility,
  type ClientChartId,
} from "@/lib/gc-fitness/client-chart-preferences";

export interface ClientChartSlot {
  id: ClientChartId;
  /** Human label for the configurator row. Always present, even when hidden. */
  label: string;
  /** `full` spans both columns — used by the two multi-chart panels. */
  span: "half" | "full";
  /** The rendered chart, or null when the coach has it switched off. */
  node: ReactNode;
}

export function ClientChartsSection({
  slots,
  hidden,
  labels,
}: {
  slots: ClientChartSlot[];
  hidden: ClientChartId[];
  labels: {
    title: string;
    subtitle: string;
    configure: string;
    configureTitle: string;
    configureHelp: string;
    allHidden: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setVisible(id: ClientChartId, visible: boolean) {
    const next = toggleChartVisibility(hidden, id, visible);
    // `SameSite=Lax` + no `Secure` so it also works on http://localhost; this
    // carries a UI preference, nothing an attacker gains anything from.
    document.cookie = `${CLIENT_CHARTS_COOKIE}=${serializeHiddenCharts(next)}; path=/; max-age=${CLIENT_CHARTS_COOKIE_MAX_AGE}; SameSite=Lax`;
    // The server decides what to render, so the toggle has to go back to it.
    // A local `useState` would show the chart WITHOUT its data.
    startTransition(() => router.refresh());
  }

  const visibleSlots = slots.filter((slot) => slot.node !== null);

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <LineChart className="size-4" />
            {labels.title}
          </h2>
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full">
              <SlidersHorizontal className="size-4" />
              {labels.configure}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="mb-3 space-y-1">
              <p className="text-sm font-semibold">{labels.configureTitle}</p>
              <p className="text-xs text-muted-foreground">
                {labels.configureHelp}
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {slots.map((slot) => {
                const checked = !hidden.includes(slot.id);
                return (
                  <div key={slot.id} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`chart-${slot.id}`}
                      checked={checked}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        setVisible(slot.id, value === true)
                      }
                    />
                    <Label
                      htmlFor={`chart-${slot.id}`}
                      className="cursor-pointer text-sm font-normal"
                    >
                      {slot.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {visibleSlots.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          {labels.allHidden}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-6 xl:grid-cols-2",
            pending && "opacity-60 transition-opacity",
          )}
        >
          {visibleSlots.map((slot) => (
            <div
              key={slot.id}
              className={cn("min-w-0", slot.span === "full" && "xl:col-span-2")}
            >
              {slot.node}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
