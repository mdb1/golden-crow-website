"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Building2,
  GripVertical,
  Loader2,
  Mail,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
  PARTNER_BOARD_STAGES,
  partnerBoardStage,
  type Partner,
  type PartnerBoardStage,
  PARTNER_PAGE_SIZE,
  type PartnerSectionPage,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";

const BOARD_QUERY_KEY = [...PARTNERS_QUERY_KEY, "board"] as const;
const boardCollisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
type ColumnHistory = { index: number; cursors: Array<string | null> };

async function loadBoardColumn(
  stage: PartnerBoardStage,
  cursor: string | null,
  signal: AbortSignal,
): Promise<PartnerSectionPage> {
  const items = new Map<string, Partner>();
  let nextCursor = cursor;
  const visited = new Set<string>();
  // An API response bounds the source scan, not the number of matches available
  // in a stage. Continue sparse scans until this column is full or exhausted.
  do {
    signal.throwIfAborted();
    const params = new URLSearchParams({
      stage,
      limit: String(PARTNER_PAGE_SIZE - items.size),
    });
    if (nextCursor) params.set("cursor", nextCursor);
    const page = await sdkFetch<PartnerSectionPage>(
      `${PARTNERS_API_ROUTE}/board?${params}`,
      { signal },
    );
    signal.throwIfAborted();
    for (const partner of page.items) items.set(partner.id, partner);
    nextCursor = page.nextCursor;
    if (nextCursor) {
      if (visited.has(nextCursor) || nextCursor === cursor)
        throw new Error(
          "Could not continue loading partners. Please try again.",
        );
      visited.add(nextCursor);
    }
  } while (items.size < PARTNER_PAGE_SIZE && nextCursor);
  return {
    items: [...items.values()].slice(0, PARTNER_PAGE_SIZE),
    nextCursor,
    scanIncomplete: false,
  };
}

const STAGE_COLORS: Record<PartnerBoardStage, string> = {
  noOrganization: "bg-slate-400",
  organizationWithoutApp: "bg-sky-500",
  freeApp: "bg-violet-500",
  contract: "bg-emerald-500",
  other: "bg-amber-500",
};

const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
  event.preventDefault();
  const current = String(
    context.over?.id ?? `column:${context.active?.data.current?.stage}`,
  );
  const index = PARTNER_BOARD_STAGES.findIndex(
    (stage) => current === `column:${stage.key}`,
  );
  const next =
    PARTNER_BOARD_STAGES[index + (event.code === "ArrowRight" ? 1 : -1)];
  const bounds = next && context.droppableRects.get(`column:${next.key}`);
  const collision = context.collisionRect;
  if (!bounds || !collision) return;
  return {
    x:
      currentCoordinates.x +
      bounds.left +
      bounds.width / 2 -
      collision.left -
      collision.width / 2,
    y:
      currentCoordinates.y +
      bounds.top +
      60 -
      collision.top -
      collision.height / 2,
  };
};

function TicketIcons({ partner }: { partner: Partner }) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      {partner.email && (
        <span title={t("Email")}>
          <Mail aria-label={t("Email")} className="size-3" />
        </span>
      )}
      {partner.linkedAppId ? (
        <span title={t("Linked app")}>
          <Smartphone aria-label={t("Linked app")} className="size-3" />
        </span>
      ) : partner.linkedOrganizationId ||
        partner.linkedIndividualPublisherId ? (
        <span title={t("Linked publisher")}>
          <Building2 aria-label={t("Linked publisher")} className="size-3" />
        </span>
      ) : null}
    </span>
  );
}

function BoardTicket({
  partner,
  disabled,
  selected,
  panelId,
  onView,
  onMove,
}: {
  partner: Partner;
  disabled: boolean;
  selected: boolean;
  panelId: string;
  onView: (partner: Partner, trigger: HTMLElement) => void;
  onMove: (partner: Partner, stage: PartnerBoardStage) => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const stage = partnerBoardStage(partner);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: partner.id,
      data: { stage },
      disabled,
    });
  return (
    <article
      ref={setNodeRef}
      aria-label={partner.companyName}
      className={cn(
        "relative min-w-0 rounded-lg border bg-card shadow-sm transition-colors hover:border-violet-300",
        selected &&
          "border-violet-400 bg-violet-50/60 ring-1 ring-violet-300 dark:bg-violet-500/10",
        isDragging && "opacity-30",
      )}
    >
      <button
        type="button"
        data-partner-detail-trigger={partner.id}
        aria-label={`${t("View partner details")}: ${partner.companyName}`}
        aria-expanded={selected}
        aria-controls={selected ? panelId : undefined}
        onClick={(event) => onView(partner, event.currentTarget)}
        className="block w-full rounded-lg px-2.5 pb-7 pt-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="line-clamp-2 break-words text-xs font-semibold leading-4">
          {partner.companyName}
        </span>
      </button>
      <span className="pointer-events-none absolute bottom-2 left-2.5">
        <TicketIcons partner={partner} />
      </span>
      <div className="absolute bottom-1 right-1 flex items-center">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${t("Drag partner")}: ${partner.companyName}`}
          disabled={disabled}
          className="flex size-6 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:opacity-40"
        >
          <GripVertical className="size-3" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={`${t("Move partner")}: ${partner.companyName}`}
              title={t("Move partner")}
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
            >
              <ArrowRightLeft className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {PARTNER_BOARD_STAGES.map((column) => (
              <DropdownMenuItem
                key={column.key}
                disabled={stage === column.key}
                onSelect={() => onMove(partner, column.key)}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    STAGE_COLORS[column.key],
                  )}
                />
                {t(column.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

function BoardColumn({
  stage,
  label,
  count,
  children,
}: {
  stage: PartnerBoardStage;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${stage}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "min-w-0 rounded-xl border bg-muted/25 p-2 transition-colors",
        isOver && "border-violet-400 bg-violet-100/60 dark:bg-violet-500/15",
      )}
    >
      <header className="mb-2 flex min-h-10 items-start gap-1.5 px-1 py-1">
        <span
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            STAGE_COLORS[stage],
          )}
        />
        <h3 className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-4">
          {label}
        </h3>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      </header>
      <div className="min-h-40 space-y-1.5">{children}</div>
    </section>
  );
}

export function PartnersBoard({
  onView,
  detailId,
  panelId,
}: {
  onView: (partner: Partner, trigger: HTMLElement) => void;
  detailId?: string;
  panelId: string;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const client = useQueryClient();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const movingRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const [histories, setHistories] = useState<
    Partial<Record<PartnerBoardStage, ColumnHistory>>
  >({});
  const columns = useQueries({
    queries: PARTNER_BOARD_STAGES.map(({ key: stage }) => {
      const history = histories[stage] ?? { index: 0, cursors: [null] };
      const cursor = history.cursors[history.index] ?? null;
      return {
        queryKey: [...BOARD_QUERY_KEY, stage, history.index, cursor],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          loadBoardColumn(stage, cursor, signal),
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
      };
    }),
  });
  const partners = [
    ...new Map(
      columns
        .flatMap((column) => column.data?.items ?? [])
        .map((partner) => [partner.id, partner]),
    ).values(),
  ];
  const fetching = columns.some((column) => column.isFetching);
  const mutation = useMutation({
    onMutate: ({ partner, stage }) =>
      Promise.all(
        [...new Set([partnerBoardStage(partner), stage])].map((affected) =>
          client.cancelQueries({ queryKey: [...BOARD_QUERY_KEY, affected] }),
        ),
      ),
    mutationFn: ({
      partner,
      stage,
    }: {
      partner: Partner;
      stage: PartnerBoardStage;
    }) =>
      sdkFetch<{ partner: Partner }>(
        `${PARTNERS_API_ROUTE}/${encodeURIComponent(partner.id)}/board-stage`,
        { method: "PATCH", body: JSON.stringify({ boardStage: stage }) },
      ),
    onSuccess: async ({ partner }, variables) => {
      client.setQueryData([...PARTNERS_QUERY_KEY, "detail", partner.id], {
        partner,
      });
      const source = partnerBoardStage(variables.partner);
      client.setQueriesData<PartnerSectionPage>(
        { queryKey: [...BOARD_QUERY_KEY, source] },
        (page) =>
          page
            ? {
                ...page,
                items: page.items.filter((item) => item.id !== partner.id),
              }
            : page,
      );
      // Refill the vacated source slot and reload the destination's own window.
      // Neither column can exceed its 20-ticket page after a move.
      await Promise.all(
        [...new Set([source, variables.stage])].map((stage) =>
          client.invalidateQueries({ queryKey: [...BOARD_QUERY_KEY, stage] }),
        ),
      );
    },
    onError: async (_error, variables) => {
      await Promise.all(
        [
          ...new Set([partnerBoardStage(variables.partner), variables.stage]),
        ].map((stage) =>
          client.refetchQueries({
            queryKey: [...BOARD_QUERY_KEY, stage],
            type: "active",
            predicate: (query) => query.state.status === "pending",
          }),
        ),
      );
    },
    onSettled: () => {
      movingRef.current = false;
    },
  });
  function changePage(
    stage: PartnerBoardStage,
    index: number,
    cursor?: string,
  ) {
    setHistories((current) => {
      const previous = current[stage] ?? { index: 0, cursors: [null] };
      return {
        ...current,
        [stage]: {
          index,
          cursors: cursor
            ? [...previous.cursors.slice(0, index), cursor]
            : previous.cursors,
        },
      };
    });
  }
  function move(partner: Partner, stage: PartnerBoardStage) {
    if (movingRef.current || partnerBoardStage(partner) === stage) return;
    movingRef.current = true;
    mutation.mutate({ partner, stage });
  }
  function finishDrag(event: DragEndEvent) {
    setDraggedId(null);
    const partner = partners.find((item) => item.id === event.active.id);
    const stage = PARTNER_BOARD_STAGES.find(
      (column) => `column:${column.key}` === event.over?.id,
    );
    if (partner && stage) move(partner, stage.key);
  }
  const dragged = partners.find((partner) => partner.id === draggedId);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {partners.length} {t("loaded partners")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={fetching || mutation.isPending}
          onClick={() => {
            void Promise.all(columns.map((column) => column.refetch()));
          }}
        >
          <RefreshCw className={cn("size-3.5", fetching && "animate-spin")} />
          {t("Refresh")}
        </Button>
      </div>
      {mutation.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Saving stage...")}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("Could not move partner.")}{" "}
          {mutation.error instanceof Error ? mutation.error.message : ""}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={(event) => setDraggedId(String(event.active.id))}
        onDragCancel={() => setDraggedId(null)}
        onDragEnd={finishDrag}
      >
        <div
          role="region"
          aria-label={t("Partners board")}
          tabIndex={detailId ? 0 : undefined}
          className={cn(
            "min-w-0 pb-2",
            detailId
              ? "overflow-x-auto overscroll-x-contain"
              : "overflow-x-hidden",
          )}
        >
          <div
            className={cn(
              "grid grid-cols-5 gap-2",
              detailId && "min-w-[1000px]",
            )}
          >
            {PARTNER_BOARD_STAGES.map((stage, index) => {
              const column = columns[index];
              const tickets = column.data?.items ?? [];
              const history = histories[stage.key] ?? {
                index: 0,
                cursors: [null],
              };
              return (
                <BoardColumn
                  key={stage.key}
                  stage={stage.key}
                  label={t(stage.label)}
                  count={tickets.length}
                >
                  {column.isPending && (
                    <p
                      role="status"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <Loader2 className="size-3 animate-spin" />
                      {t("Loading partners...")}
                    </p>
                  )}
                  {column.isError && (
                    <div
                      role="alert"
                      className="space-y-1 text-xs text-destructive"
                    >
                      <p>{t("Could not load partners.")}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={column.isFetching || mutation.isPending}
                        onClick={() => void column.refetch()}
                      >
                        {t("Retry")}
                      </Button>
                    </div>
                  )}
                  {tickets.map((partner) => (
                    <BoardTicket
                      key={partner.id}
                      partner={partner}
                      selected={partner.id === detailId}
                      disabled={mutation.isPending}
                      panelId={panelId}
                      onView={onView}
                      onMove={move}
                    />
                  ))}
                  {(history.index > 0 || column.data?.nextCursor) && (
                    <nav
                      aria-label={`${t("Partner pagination")}: ${t(stage.label)}`}
                      className="flex items-center justify-between gap-1 pt-2"
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("Previous page")}
                        disabled={
                          column.isFetching ||
                          mutation.isPending ||
                          history.index === 0
                        }
                        onClick={() => changePage(stage.key, history.index - 1)}
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <span className="text-[10px] text-muted-foreground">
                        {t("Page")} {history.index + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("Next page")}
                        disabled={
                          column.isFetching ||
                          mutation.isPending ||
                          !column.data?.nextCursor
                        }
                        onClick={() => {
                          if (column.data?.nextCursor)
                            changePage(
                              stage.key,
                              history.index + 1,
                              column.data.nextCursor,
                            );
                        }}
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </nav>
                  )}
                </BoardColumn>
              );
            })}
          </div>
        </div>
        <DragOverlay>
          {dragged ? (
            <div className="w-48 rounded-lg border border-violet-400 bg-card p-2.5 shadow-xl">
              <p className="line-clamp-2 text-xs font-semibold">
                {dragged.companyName}
              </p>
              <div className="mt-2">
                <TicketIcons partner={dragged} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
