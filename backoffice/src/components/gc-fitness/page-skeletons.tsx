// page-skeletons.tsx — #492.
//
// Building blocks for the `loading.tsx` of the heavy gc-fitness routes, so they
// all share one look (same as dashboard/loading.tsx: token-based `Skeleton`,
// rounded-[1.25rem] cards, works in both themes). Server-safe: no hooks, no
// data. Each block carries `aria-hidden`; the wrapper is `aria-busy`.

import { Skeleton } from "@/components/ui/skeleton";

const CARD = "rounded-[1.25rem] border bg-card p-5 shadow-sm";

/** Page wrapper: `gc-page` (main sections) or the narrow sub-page column. */
export function PageSkeleton({
  variant = "page",
  children,
}: {
  variant?: "page" | "subpage";
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      className={
        variant === "subpage"
          ? "mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6"
          : "gc-page flex flex-col gap-6"
      }
    >
      {children}
    </div>
  );
}

/** Title + subtitle, optional action pill(s); `back` adds the sub-page arrow. */
export function HeaderSkeleton({
  actions = 1,
  back = false,
}: {
  actions?: number;
  back?: boolean;
}) {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-3">
        {back ? <Skeleton className="size-9 shrink-0 rounded-md" /> : null}
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 max-w-[60vw]" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
      </div>
      {actions > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: actions }).map((_, idx) => (
            <Skeleton key={idx} className="h-10 w-32 rounded-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** N-up KPI tiles. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className={`flex flex-col gap-3 ${CARD}`}>
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A card of avatar + two-line rows (feeds, lists, checklists). */
export function RowListSkeleton({
  rows = 6,
  title = true,
}: {
  rows?: number;
  title?: boolean;
}) {
  return (
    <div aria-hidden className={`flex flex-col gap-4 ${CARD}`}>
      {title ? <Skeleton className="h-6 w-48" /> : null}
      <div className="flex flex-col divide-y divide-border">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 py-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A table card: header row + N body rows of `cols` cells. */
export function TableSkeleton({
  rows = 8,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div aria-hidden className={`flex flex-col gap-3 overflow-hidden ${CARD}`}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 max-w-[60%] rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div
        className="grid gap-3 border-b pb-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, idx) => (
          <Skeleton key={idx} className="h-3 w-20 max-w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid items-center gap-3 py-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className={col === 0 ? "h-4 w-full" : "h-4 w-3/4"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of plain content cards (title + body block). */
export function CardGridSkeleton({
  count = 4,
  columns = 2,
  bodyClassName = "h-28",
}: {
  count?: number;
  columns?: 1 | 2 | 3;
  bodyClassName?: string;
}) {
  const grid =
    columns === 3
      ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      : columns === 2
        ? "grid gap-4 xl:grid-cols-2"
        : "grid gap-4";
  return (
    <div aria-hidden className={grid}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className={`flex flex-col gap-3 ${CARD}`}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className={`w-full rounded-xl ${bodyClassName}`} />
        </div>
      ))}
    </div>
  );
}

/** Pill tabs / filter chips row. */
export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, idx) => (
        <Skeleton key={idx} className="h-9 w-28 rounded-full" />
      ))}
    </div>
  );
}
