"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Building2,
  FileUp,
  Grid2X2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PARTNERS_API_ROUTE,
  PARTNERS_QUERY_KEY,
  PARTNERS_ROUTE,
  PARTNER_SECTIONS,
  PARTNER_PAGE_SIZE,
  type Partner,
  type PartnerSection,
  type PartnerSectionPage,
} from "@/lib/connected-partners";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";
import { cn } from "@/lib/utils";
import {
  PartnerDetailPanel,
  PartnersSplitPane,
} from "@/components/god-mode/partner-detail-panel";
import {
  PartnerEditorDialog,
  partnerAppStatusLabel,
} from "@/components/god-mode/partner-editor-dialog";
import {
  PartnerCsvImportDialog,
  PartnerCsvImportRulesDialog,
} from "@/components/god-mode/partner-csv-import-dialog";

function useText() {
  const { language } = useAppLanguage();
  return (text: string) => appText(language, text);
}

function RequestError({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : fallback}
    </p>
  );
}

function viewPartnerFromSurface(
  event: MouseEvent<HTMLElement>,
  onView: (trigger: HTMLElement) => void,
) {
  if (
    event.defaultPrevented ||
    (event.target instanceof Element &&
      event.target.closest(
        "button, a, input, textarea, select, label, details, [role='checkbox'], [contenteditable='true']",
      )) ||
    window.getSelection()?.toString()
  )
    return;
  const trigger = event.currentTarget.querySelector<HTMLElement>(
    "[data-partner-detail-trigger]",
  );
  if (trigger) onView(trigger);
}

function PartnerCard({
  partner,
  selected,
  disabled,
  onSelect,
  onEdit,
  onView,
  detailOpen,
  panelId,
}: {
  partner: Partner;
  selected: boolean;
  disabled: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onView: (trigger: HTMLElement) => void;
  detailOpen: boolean;
  panelId: string;
}) {
  const t = useText();
  return (
    <article
      data-state={detailOpen ? "selected" : undefined}
      onClick={(event) => viewPartnerFromSurface(event, onView)}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition hover:border-violet-300/70 hover:shadow-md dark:hover:border-violet-400/30",
        detailOpen &&
          "border-violet-400 bg-violet-50/60 ring-1 ring-violet-300 dark:border-violet-400/60 dark:bg-violet-500/10 dark:ring-violet-400/30",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-sky-400"
      />
      <div className="mb-5 flex items-start gap-3">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`${t("Select partner")}: ${partner.companyName} — ${partner.firstName} ${partner.lastName}`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t("Company name")}</p>
          <h3 className="break-words font-heading text-lg font-semibold">
            <button
              type="button"
              data-partner-detail-trigger={partner.id}
              aria-label={`${t("View partner details")}: ${partner.companyName}`}
              aria-expanded={detailOpen}
              aria-controls={detailOpen ? panelId : undefined}
              className="rounded-sm text-left outline-none hover:text-violet-700 focus-visible:ring-3 focus-visible:ring-ring/45 dark:hover:text-violet-300"
              onClick={(event) => onView(event.currentTarget)}
            >
              {partner.companyName}
            </button>
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("Edit partner")}: ${partner.companyName}`}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("First name")}</dt>
          <dd className="mt-1 break-words">{partner.firstName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Last name")}</dt>
          <dd className="mt-1 break-words">{partner.lastName}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Phone number")}</dt>
          <dd className="mt-1 break-words">{partner.phoneNumber || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Email")}</dt>
          <dd className="mt-1 break-words">{partner.email}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Meeting date")}</dt>
          <dd className="mt-1">{partner.meetingDate ?? "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Notes")}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">
            {partner.notes ?? "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Linked organization")}</dt>
          <dd className="mt-1 break-words">
            {partner.linkedOrganization?.name ??
              partner.linkedOrganizationSnapshot?.name ??
              partner.linkedOrganizationId ??
              "—"}
          </dd>
          {partner.linkedOrganizationId && !partner.linkedOrganization && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {t("Linked organization is unavailable.")} (
              {partner.linkedOrganizationId})
            </p>
          )}
        </div>
        {partner.linkedIndividualPublisherId && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">
              {t("Linked individual publisher")}
            </dt>
            <dd className="mt-1 break-words">
              {partner.linkedIndividualPublisher?.name ??
                partner.linkedIndividualPublisherSnapshot?.name ??
                partner.linkedIndividualPublisherId}
            </dd>
            {!partner.linkedIndividualPublisher && (
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                {t("Linked individual publisher is unavailable.")} (
                {partner.linkedIndividualPublisherId})
              </p>
            )}
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("Linked app")}</dt>
          <dd className="mt-1 break-words">
            {partner.linkedApp?.publisherName ??
              partner.linkedAppSnapshot?.publisherName ??
              partner.linkedAppId ??
              "—"}
            {partner.linkedApp && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t(partnerAppStatusLabel(partner.linkedApp.status))}
              </span>
            )}
          </dd>
          {partner.linkedAppId && !partner.linkedApp && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {t(
                "Linked app is unavailable or no longer belongs to a linked publisher.",
              )}{" "}
              ({partner.linkedAppId})
            </p>
          )}
        </div>
      </dl>
    </article>
  );
}

type PartnerView = "grid" | "table";
type PageHistory = { index: number; cursors: Array<string | null> };
const VIEW_STORAGE_KEY = "golden-crow-partners-view";
const ALL_SECTIONS = [
  ...PARTNER_SECTIONS,
  { key: "other", label: "Other app statuses or missing links" },
] as const;

// Each request and each user action has a fixed budget. A sparse category can
// continue filling this same page without making any previously read rows vanish.
async function loadSectionWindow(
  section: PartnerSection,
  cursor: string | null,
  initialItems: Partner[] = [],
  signal?: AbortSignal,
): Promise<PartnerSectionPage> {
  let items = [...initialItems];
  let nextCursor = cursor;
  for (
    let request = 0;
    request < 3 && items.length < PARTNER_PAGE_SIZE;
    request++
  ) {
    signal?.throwIfAborted();
    const params = new URLSearchParams({
      section,
      limit: String(PARTNER_PAGE_SIZE - items.length),
    });
    if (nextCursor) params.set("cursor", nextCursor);
    const page = await sdkFetch<PartnerSectionPage>(
      `${PARTNERS_API_ROUTE}?${params}`,
      { signal },
    );
    signal?.throwIfAborted();
    items = Array.from(
      new Map(
        [...items, ...page.items].map((partner) => [partner.id, partner]),
      ).values(),
    );
    const previousCursor = nextCursor;
    nextCursor = page.nextCursor;
    if (!nextCursor || items.length >= PARTNER_PAGE_SIZE) break;
    if (nextCursor === previousCursor)
      throw new Error("Could not continue loading partners. Please try again.");
  }
  return {
    items,
    nextCursor,
    scanIncomplete: items.length < PARTNER_PAGE_SIZE && Boolean(nextCursor),
  };
}

function PartnerTable({
  partners,
  selected,
  disabled,
  onSelect,
  onEdit,
  onView,
  detailId,
  panelId,
}: {
  partners: Partner[];
  selected: Set<string>;
  disabled: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (id: string) => void;
  onView: (partner: Partner, trigger: HTMLElement) => void;
  detailId?: string;
  panelId: string;
}) {
  const t = useText();
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border">
      <table
        aria-label={t("Partners table")}
        className="w-full min-w-[78rem] text-left text-sm"
      >
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-10 px-4 py-3">
              <span className="sr-only">{t("Select partner")}</span>
            </th>
            {[
              "Company name",
              "Contact",
              "Email",
              "Phone number",
              "Meeting date",
              "Publishers",
              "App",
              "Status",
              "Notes",
              "Actions",
            ].map((label) => (
              <th
                key={label}
                scope="col"
                className={
                  label === "Actions"
                    ? "sticky right-0 z-10 border-l bg-muted px-3 py-3 font-medium"
                    : "px-3 py-3 font-medium"
                }
              >
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {partners.map((partner) => (
            <tr
              key={partner.id}
              data-state={detailId === partner.id ? "selected" : undefined}
              onClick={(event) =>
                viewPartnerFromSurface(event, (trigger) =>
                  onView(partner, trigger),
                )
              }
              className={cn(
                "cursor-pointer align-top transition hover:bg-muted/30",
                detailId === partner.id &&
                  "bg-violet-50/80 hover:bg-violet-50 dark:bg-violet-500/10 dark:hover:bg-violet-500/15",
              )}
            >
              <td className="px-4 py-4">
                <Checkbox
                  checked={selected.has(partner.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onSelect(partner.id, checked === true)
                  }
                  aria-label={`${t("Select partner")}: ${partner.companyName} — ${partner.firstName} ${partner.lastName}`}
                />
              </td>
              <td className="min-w-40 max-w-56 break-words px-3 py-4 font-semibold">
                <button
                  type="button"
                  data-partner-detail-trigger={partner.id}
                  aria-label={`${t("View partner details")}: ${partner.companyName}`}
                  aria-expanded={detailId === partner.id}
                  aria-controls={detailId === partner.id ? panelId : undefined}
                  className="rounded-sm text-left outline-none hover:text-violet-700 focus-visible:ring-3 focus-visible:ring-ring/45 dark:hover:text-violet-300"
                  onClick={(event) => onView(partner, event.currentTarget)}
                >
                  {partner.companyName}
                </button>
              </td>
              <td className="min-w-32 max-w-48 break-words px-3 py-4">
                {partner.firstName} {partner.lastName}
              </td>
              <td className="min-w-40 max-w-56 break-all px-3 py-4">
                {partner.email}
              </td>
              <td className="min-w-32 max-w-48 break-words px-3 py-4">
                {partner.phoneNumber || "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-4">
                {partner.meetingDate ?? "—"}
              </td>
              <td className="min-w-48 max-w-64 space-y-2 break-words px-3 py-4">
                {partner.linkedOrganizationId && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("Organization")}
                    </p>
                    <p>
                      {partner.linkedOrganization?.name ??
                        partner.linkedOrganizationSnapshot?.name ??
                        partner.linkedOrganizationId}
                    </p>
                    {!partner.linkedOrganization && (
                      <p className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">
                        {t("Linked organization is unavailable.")} (
                        {partner.linkedOrganizationId})
                      </p>
                    )}
                  </div>
                )}
                {partner.linkedIndividualPublisherId && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("Individual publisher")}
                    </p>
                    <p>
                      {partner.linkedIndividualPublisher?.name ??
                        partner.linkedIndividualPublisherSnapshot?.name ??
                        partner.linkedIndividualPublisherId}
                    </p>
                    {!partner.linkedIndividualPublisher && (
                      <p className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">
                        {t("Linked individual publisher is unavailable.")} (
                        {partner.linkedIndividualPublisherId})
                      </p>
                    )}
                  </div>
                )}
                {!partner.linkedOrganizationId &&
                  !partner.linkedIndividualPublisherId &&
                  "—"}
              </td>
              <td className="min-w-44 max-w-64 break-words px-3 py-4">
                {partner.linkedApp?.publisherName ??
                  partner.linkedAppSnapshot?.publisherName ??
                  partner.linkedAppId ??
                  "—"}
                {partner.linkedAppId && !partner.linkedApp && (
                  <p className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">
                    {t(
                      "Linked app is unavailable or no longer belongs to a linked publisher.",
                    )}{" "}
                    ({partner.linkedAppId})
                  </p>
                )}
              </td>
              <td className="min-w-36 px-3 py-4">
                {partner.linkedApp ? (
                  <span className="inline-flex rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
                    {t(partnerAppStatusLabel(partner.linkedApp.status))}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="min-w-28 max-w-64 px-3 py-4">
                {partner.notes ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-violet-700 dark:text-violet-300">
                      {t("View notes")}
                    </summary>
                    <p className="mt-2 max-w-64 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {partner.notes}
                    </p>
                  </details>
                ) : (
                  "—"
                )}
              </td>
              <td className="sticky right-0 z-10 border-l bg-background px-3 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t("Edit partner")}: ${partner.companyName}`}
                  onClick={() => onEdit(partner.id)}
                >
                  <Pencil className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartnerPagination({
  pageIndex,
  busy,
  hasNext,
  onPrevious,
  onNext,
  onRefresh,
  refreshing = false,
  belowResults = false,
}: {
  pageIndex: number;
  busy: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  belowResults?: boolean;
}) {
  const t = useText();
  return (
    <nav
      aria-label={t(
        belowResults
          ? "Partner pagination below results"
          : "Partner pagination",
      )}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("Page")} {pageIndex + 1} · {t("20 per page")}
        </span>
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={t("Refresh section")}
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("Refresh section")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || pageIndex === 0}
          onClick={onPrevious}
        >
          <ArrowLeft className="size-4" />
          {t("Previous page")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !hasNext}
          onClick={onNext}
        >
          {t("Next page")}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

export function PartnersBrowser({
  initialEditor,
}: { initialEditor?: string } = {}) {
  const t = useText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewId = useId();
  const [view, setView] = useState<PartnerView>("grid");
  const [activeSection, setActiveSection] = useState<PartnerSection | "">("");
  const [histories, setHistories] = useState<
    Partial<Record<PartnerSection, PageHistory>>
  >({});
  const [editor, setEditor] = useState<string | null>(initialEditor ?? null);
  const [csvDialog, setCsvDialog] = useState<"import" | "rules" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState<{
    id: string;
    companyName: string;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailPanelId = `${viewId}-detail`;
  const continuationAbort = useRef<AbortController | null>(null);
  useEffect(() => () => continuationAbort.current?.abort(), []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "table") setView(stored);
    } catch {
      /* View preference is optional when browser storage is unavailable. */
    }
  }, []);
  function changeView(next: string) {
    if (next !== "grid" && next !== "table") return;
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* Keep the current session usable. */
    }
  }
  const history = activeSection
    ? (histories[activeSection] ?? { index: 0, cursors: [null] })
    : { index: 0, cursors: [null] };
  const cursor = history.cursors[history.index] ?? null;
  const queryKey = [
    ...PARTNERS_QUERY_KEY,
    "section",
    activeSection,
    history.index,
    cursor,
  ] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(activeSection),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      loadSectionWindow(activeSection as PartnerSection, cursor, [], signal),
  });
  const partners = activeSection ? (query.data?.items ?? []) : [];
  useEffect(() => {
    if (
      detail &&
      query.isSuccess &&
      !query.isFetching &&
      !query.data.items.some((partner) => partner.id === detail.id)
    )
      setDetail(null);
  }, [detail, query.data, query.isSuccess, query.isFetching]);
  function openDetails(partner: Partner, trigger: HTMLElement) {
    setDetail({ id: partner.id, companyName: partner.companyName });
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 1280px)").matches)
        trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function closeDetails() {
    const trigger = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(
        "[data-partner-detail-trigger]",
      ) ?? [],
    ).find((item) => item.dataset.partnerDetailTrigger === detail?.id);
    setDetail(null);
    trigger?.focus({ preventScroll: true });
    window.requestAnimationFrame(() =>
      trigger?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
  }
  const selectedIds = partners
    .filter((partner) => selected.has(partner.id))
    .map((partner) => partner.id);
  const selectedPartners = partners.filter((partner) =>
    selected.has(partner.id),
  );
  useEffect(() => {
    const visibleIds = new Set(
      query.data?.items.map((partner) => partner.id) ?? [],
    );
    setSelected((current) => {
      const visibleSelection = [...current].filter((id) => visibleIds.has(id));
      return visibleSelection.length === current.size
        ? current
        : new Set(visibleSelection);
    });
  }, [query.data?.items]);
  const continuation = useMutation({
    mutationFn: ({
      section,
      data,
    }: {
      section: PartnerSection;
      data: PartnerSectionPage;
      key: typeof queryKey;
    }) => {
      continuationAbort.current?.abort();
      const controller = new AbortController();
      continuationAbort.current = controller;
      return loadSectionWindow(
        section,
        data.nextCursor,
        data.items,
        controller.signal,
      ).finally(() => {
        if (continuationAbort.current === controller)
          continuationAbort.current = null;
      });
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData<PartnerSectionPage>(variables.key, (current) =>
        current === variables.data ? result : current,
      );
    },
  });
  function switchSection(next: string) {
    setDetail(null);
    setSelected(new Set());
    continuationAbort.current?.abort();
    continuation.reset();
    setActiveSection(next as PartnerSection | "");
  }
  function changePage(index: number, nextCursor?: string) {
    if (!activeSection) return;
    const section = activeSection;
    setDetail(null);
    setSelected(new Set());
    continuationAbort.current?.abort();
    continuation.reset();
    setHistories((current) => {
      const previous = current[section] ?? { index: 0, cursors: [null] };
      const cursors = nextCursor
        ? [...previous.cursors.slice(0, index), nextCursor]
        : previous.cursors;
      return { ...current, [section]: { index, cursors } };
    });
  }
  function reconcilePage() {
    const latest = queryClient.getQueryData<PartnerSectionPage>(queryKey);
    if (history.index > 0 && latest?.items.length === 0 && !latest.nextCursor)
      changePage(history.index - 1);
  }
  function closeEditor() {
    setEditor(null);
    reconcilePage();
    if (initialEditor) router.replace(PARTNERS_ROUTE);
  }
  function closeCsvDialog() {
    setCsvDialog(null);
    reconcilePage();
  }
  const deletion = useMutation({
    mutationFn: (ids: string[]) =>
      sdkFetch<{ deletedIds: string[] }>(`${PARTNERS_API_ROUTE}/delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async () => {
      setSelected(new Set());
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY });
      reconcilePage();
    },
  });
  const busy = deletion.isPending || query.isFetching || continuation.isPending;
  const fullPage = partners.length >= PARTNER_PAGE_SIZE;
  const hasContinuation = Boolean(query.data?.nextCursor) && !fullPage;
  const allSelected =
    partners.length > 0 && selectedIds.length === partners.length;
  function selectPartner(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function renderPagination(belowResults = false) {
    return (
      <PartnerPagination
        pageIndex={history.index}
        busy={busy}
        hasNext={fullPage && Boolean(query.data?.nextCursor)}
        belowResults={belowResults}
        refreshing={query.isFetching || deletion.isPending}
        onRefresh={
          belowResults
            ? undefined
            : () => {
                setSelected(new Set());
                continuationAbort.current?.abort();
                continuation.reset();
                void query.refetch();
                if (detail)
                  void queryClient.invalidateQueries({
                    queryKey: [...PARTNERS_QUERY_KEY, "detail", detail.id],
                    exact: true,
                  });
              }
        }
        onPrevious={() => changePage(history.index - 1)}
        onNext={() => {
          if (query.data?.nextCursor)
            changePage(history.index + 1, query.data.nextCursor);
        }}
      />
    );
  }

  return (
    <section className="glass-panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-xl font-semibold">
            {t("Partners")}
          </h2>
          <HeaderUnclutterButton />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={changeView}>
            <TabsList
              aria-label={t("Partner view")}
              className="h-10 rounded-xl bg-muted/70 p-1"
            >
              <TabsTrigger
                id={`${viewId}-grid-tab`}
                aria-controls={`${viewId}-view-panel`}
                value="grid"
                className="gap-1.5 rounded-lg px-3 py-2"
              >
                <Grid2X2 className="size-4" />
                {t("Grid")}
              </TabsTrigger>
              <TabsTrigger
                id={`${viewId}-table-tab`}
                aria-controls={`${viewId}-view-panel`}
                value="table"
                className="gap-1.5 rounded-lg px-3 py-2"
              >
                <Table2 className="size-4" />
                {t("Table")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => setCsvDialog("rules")}
          >
            <BookOpen className="size-4" />
            {t("Import rules")}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setCsvDialog("import")}
          >
            <FileUp className="size-4" />
            {t("Import CSV")}
          </Button>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              disabled={deletion.isPending}
              onClick={() => {
                deletion.reset();
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" />
              {t("Delete selected")} ({selectedIds.length})
            </Button>
          )}
          <Button
            onClick={() => setEditor("new")}
            className="h-10 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-white shadow-lg shadow-violet-500/15"
          >
            <Plus className="size-4" />
            {t("New partner")}
          </Button>
        </div>
      </div>
      <PartnersSplitPane
        detail={
          detail ? (
            <PartnerDetailPanel
              key={detail.id}
              partnerId={detail.id}
              companyName={detail.companyName}
              panelId={detailPanelId}
              onEdit={() => setEditor(detail.id)}
              onClose={closeDetails}
            />
          ) : undefined
        }
      >
        <div
          ref={listRef}
          id={`${viewId}-view-panel`}
          role="tabpanel"
          aria-labelledby={`${viewId}-${view}-tab`}
        >
          <Accordion
            type="single"
            collapsible
            value={activeSection}
            onValueChange={switchSection}
            className="gap-3"
          >
            {ALL_SECTIONS.map((section, index) => (
              <AccordionItem
                key={section.key}
                value={section.key}
                className="overflow-hidden rounded-2xl border! border-violet-100 bg-background/60 dark:border-violet-400/15"
              >
                <AccordionTrigger className="items-center gap-3 rounded-2xl px-4 py-4 text-base hover:no-underline data-[state=open]:bg-violet-50/60 dark:data-[state=open]:bg-violet-500/5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
                    >
                      {index + 1}
                    </span>
                    <span className="text-left font-semibold">
                      {t(section.label)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="h-auto px-4 pb-4">
                  {activeSection === section.key && (
                    <div className="space-y-4 pt-4">
                      {query.isPending && (
                        <p
                          role="status"
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Loader2 className="size-4 animate-spin" />
                          {t("Loading partners...")}
                        </p>
                      )}
                      {query.isError && (
                        <div className="space-y-2">
                          <RequestError
                            error={query.error}
                            fallback={t("Could not load partners.")}
                          />
                          <Button
                            variant="outline"
                            onClick={() => query.refetch()}
                          >
                            {t("Retry")}
                          </Button>
                        </div>
                      )}
                      {!query.isPending && renderPagination()}
                      {continuation.isError && (
                        <RequestError
                          error={continuation.error}
                          fallback={t("Could not load partners.")}
                        />
                      )}
                      {hasContinuation && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            if (activeSection && query.data)
                              continuation.mutate({
                                section: activeSection,
                                data: query.data,
                                key: queryKey,
                              });
                          }}
                        >
                          {continuation.isPending && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          {t("Find more partners")}
                        </Button>
                      )}
                      {!query.isPending &&
                        !query.isError &&
                        partners.length === 0 && (
                          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                            <Building2 className="mx-auto mb-2 size-6" />
                            {t(
                              hasContinuation
                                ? "Keep looking in this section."
                                : history.index > 0
                                  ? "No partners on this page."
                                  : "No partners in this section.",
                            )}
                          </div>
                        )}
                      {partners.length > 0 && (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={
                                  allSelected
                                    ? true
                                    : selectedIds.length > 0
                                      ? "indeterminate"
                                      : false
                                }
                                disabled={deletion.isPending}
                                onCheckedChange={(checked) =>
                                  setSelected(
                                    checked
                                      ? new Set(
                                          partners.map((partner) => partner.id),
                                        )
                                      : new Set(),
                                  )
                                }
                              />
                              {t("Select this page")}
                            </label>
                            <span className="text-muted-foreground">
                              {partners.length} {t("partners on this page")}
                            </span>
                          </div>
                          {view === "grid" ? (
                            <div
                              className={cn(
                                "grid gap-4",
                                detail
                                  ? "md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                                  : "md:grid-cols-2 xl:grid-cols-3",
                              )}
                            >
                              {partners.map((partner) => (
                                <PartnerCard
                                  key={partner.id}
                                  partner={partner}
                                  selected={selected.has(partner.id)}
                                  disabled={deletion.isPending}
                                  onSelect={(checked) =>
                                    selectPartner(partner.id, checked)
                                  }
                                  onEdit={() => setEditor(partner.id)}
                                  onView={(trigger) =>
                                    openDetails(partner, trigger)
                                  }
                                  detailOpen={detail?.id === partner.id}
                                  panelId={detailPanelId}
                                />
                              ))}
                            </div>
                          ) : (
                            <PartnerTable
                              partners={partners}
                              selected={selected}
                              disabled={deletion.isPending}
                              onSelect={selectPartner}
                              onEdit={setEditor}
                              onView={openDetails}
                              detailId={detail?.id}
                              panelId={detailPanelId}
                            />
                          )}
                        </>
                      )}
                      {!query.isPending &&
                        partners.length > 0 &&
                        renderPagination(true)}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </PartnersSplitPane>
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!deletion.isPending) setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete selected partners?")} ({selectedIds.length})
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "These contacts will be permanently deleted. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {selectedPartners.map((partner) => (
              <li key={partner.id} className="break-words">
                {partner.companyName} · {partner.firstName} {partner.lastName}
              </li>
            ))}
          </ul>
          {deletion.isError && (
            <RequestError
              error={deletion.error}
              fallback={t("Could not delete partners.")}
            />
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={deletion.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deletion.isPending || !selectedIds.length}
              onClick={() => deletion.mutate(selectedIds)}
            >
              {deletion.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("Delete selected")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editor && (
        <PartnerEditorDialog
          key={editor}
          partnerId={editor === "new" ? undefined : editor}
          onClose={closeEditor}
        />
      )}
      {csvDialog === "import" && (
        <PartnerCsvImportDialog onClose={closeCsvDialog} />
      )}
      {csvDialog === "rules" && (
        <PartnerCsvImportRulesDialog onClose={closeCsvDialog} />
      )}
    </section>
  );
}

export function PartnerEditor({ partnerId }: { partnerId?: string }) {
  const router = useRouter();
  return (
    <PartnerEditorDialog
      partnerId={partnerId}
      onClose={() => router.push(PARTNERS_ROUTE)}
    />
  );
}
