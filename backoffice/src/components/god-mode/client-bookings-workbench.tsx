"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListChecks,
  Mail,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { sdkFetch } from "@/lib/sdk-client";
import type {
  ClientBookingRecord,
  ClientBookingsResponse,
} from "@/lib/client-bookings";
import { appText, type AppLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

type BookingView = "calendar" | "list";

const CALENDAR_BOOKINGS_QUERY_KEY = "god-mode-client-bookings-calendar";
const LIST_BOOKINGS_QUERY_KEY = "god-mode-client-bookings-list";

const WEEKDAYS: Record<AppLanguage, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
}

function getTodayDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(
    today.getDate(),
  )}`;
}

function parseMonthKey(monthKey: string) {
  const [yearToken = "", monthToken = ""] = monthKey.split("-");
  const year = Number(yearToken);
  const monthNumber = Number(monthToken);

  return { year, monthNumber };
}

function addMonths(monthKey: string, delta: number) {
  const { year, monthNumber } = parseMonthKey(monthKey);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}`;
}

function getDateKey(year: number, monthNumber: number, day: number) {
  return `${year}-${pad2(monthNumber)}-${pad2(day)}`;
}

function getMonthCells(monthKey: string) {
  const { year, monthNumber } = parseMonthKey(monthKey);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const cells: Array<{ key: string; dateKey?: string; day?: number }> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `blank-start-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = getDateKey(year, monthNumber, day);
    cells.push({ key: dateKey, dateKey, day });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}` });
  }

  return cells;
}

function getLocale(language: AppLanguage) {
  return language === "es" ? "es-AR" : "en-US";
}

function formatMonthLabel(monthKey: string, language: AppLanguage) {
  const { year, monthNumber } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat(getLocale(language), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatDateKey(dateKey: string, language: AppLanguage) {
  const [yearToken = "", monthToken = "", dayToken = ""] = dateKey.split("-");
  const year = Number(yearToken);
  const monthNumber = Number(monthToken);
  const day = Number(dayToken);

  if (!year || !monthNumber || !day) {
    return dateKey;
  }

  return new Intl.DateTimeFormat(getLocale(language), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, day)));
}

function formatClockTime(time: string) {
  const [hourToken = "", minuteToken = ""] = time.split(":");
  const hour = Number(hourToken);
  const minute = Number(minuteToken);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${pad2(hour12)}:${pad2(minute)} ${suffix}`;
}

function formatTimeRange(booking: ClientBookingRecord) {
  const start = booking.event.startTime
    ? formatClockTime(booking.event.startTime)
    : "";
  const end = booking.event.endTime
    ? formatClockTime(booking.event.endTime)
    : "";

  return [start, end].filter(Boolean).join(" - ") || booking.event.title;
}

function formatMeetingCount(count: number, language: AppLanguage) {
  if (language === "es") {
    return `${count} ${count === 1 ? "reunión" : "reuniones"}`;
  }

  return `${count} ${count === 1 ? "meeting" : "meetings"}`;
}

function formatAckCalendarLabel(
  bookings: ClientBookingRecord[],
  language: AppLanguage,
) {
  const acknowledgedCount = bookings.filter((booking) => booking.ack).length;
  const unacknowledgedCount = bookings.length - acknowledgedCount;

  if (acknowledgedCount > 0 && unacknowledgedCount > 0) {
    return language === "es"
      ? `${unacknowledgedCount} nuevas · ${acknowledgedCount} ack`
      : `${unacknowledgedCount} new · ${acknowledgedCount} ack`;
  }

  if (acknowledgedCount > 0) {
    return `${acknowledgedCount} ack`;
  }

  return formatMeetingCount(bookings.length, language);
}

function formatDateTime(value: string | undefined, language: AppLanguage) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getLocale(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function groupBookingsByDate(bookings: ClientBookingRecord[]) {
  const grouped = new Map<string, ClientBookingRecord[]>();

  bookings.forEach((booking) => {
    const dateKey = booking.event.date;
    if (!dateKey) {
      return;
    }

    const entries = grouped.get(dateKey) ?? [];
    entries.push(booking);
    grouped.set(dateKey, entries);
  });

  grouped.forEach((entries) => {
    entries.sort((left, right) =>
      left.event.startTime.localeCompare(right.event.startTime),
    );
  });

  return grouped;
}

function buildCalendarQueryPath(monthKey: string) {
  const params = new URLSearchParams({
    view: "calendar",
    month: monthKey,
    limit: "250",
  });

  return `/admin/client-bookings?${params.toString()}`;
}

function buildListQueryPath(cursor: string | undefined) {
  const params = new URLSearchParams({
    view: "list",
    limit: "20",
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/admin/client-bookings?${params.toString()}`;
}

function useAcknowledgeBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      sdkFetch<{ booking: ClientBookingRecord }>(
        `/admin/client-bookings/${encodeURIComponent(bookingId)}/ack`,
        {
          method: "PATCH",
          body: JSON.stringify({ ack: true }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [CALENDAR_BOOKINGS_QUERY_KEY],
      });
      queryClient.invalidateQueries({ queryKey: [LIST_BOOKINGS_QUERY_KEY] });
    },
  });
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function BookingInfoCard({
  booking,
  language,
  isAcknowledging,
  onAcknowledge,
}: {
  booking: ClientBookingRecord;
  language: AppLanguage;
  isAcknowledging: boolean;
  onAcknowledge: (bookingId: string) => void;
}) {
  const t = (text: string) => appText(language, text);
  const isAcknowledged = booking.ack;
  const accentTextClass = isAcknowledged
    ? "text-amber-800 dark:text-amber-200"
    : "text-slate-700 dark:text-slate-200";
  const infoBoxClass = isAcknowledged
    ? "border-amber-200/70 bg-background/70 dark:border-amber-300/18 dark:bg-background/45"
    : "border-slate-200/80 bg-white/90 dark:border-border/70 dark:bg-background/70";

  return (
    <article
      className={cn(
        "rounded-xl border p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition-colors",
        isAcknowledged
          ? "border-amber-300/55 bg-amber-50/80 shadow-[0_12px_24px_rgba(245,158,11,0.08)] dark:border-amber-300/20 dark:bg-amber-400/10"
          : "border-slate-200/90 bg-white dark:border-border/80 dark:bg-background/72",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-black uppercase tracking-[0.16em]",
              accentTextClass,
            )}
          >
            {formatTimeRange(booking)}
          </p>
          <h3 className="mt-1 truncate font-heading text-lg font-semibold text-foreground">
            {booking.form.fullName || t("Unnamed contact")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {booking.form.companyName || t("No company provided")}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge
            variant={isAcknowledged ? "warning" : "outline"}
            className={
              isAcknowledged
                ? "border-amber-500/35 bg-amber-100 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/12 dark:text-amber-100"
                : "border-slate-300/80 bg-white text-slate-800 dark:border-border dark:bg-background dark:text-foreground"
            }
          >
            {isAcknowledged ? t("Acknowledged") : t("Not acknowledged")}
          </Badge>
          {!isAcknowledged ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAcknowledge(booking.id)}
              disabled={isAcknowledging}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAcknowledging ? t("Saving...") : t("Confirm ack")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            infoBoxClass,
          )}
        >
          <Mail className={cn("h-4 w-4 shrink-0", accentTextClass)} />
          <a
            className="truncate text-foreground hover:underline"
            href={`mailto:${booking.form.email}`}
          >
            {booking.form.email || t("No email")}
          </a>
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            infoBoxClass,
          )}
        >
          <Phone className={cn("h-4 w-4 shrink-0", accentTextClass)} />
          <span className="truncate">
            {booking.form.whatsapp || t("No WhatsApp")}
          </span>
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            infoBoxClass,
          )}
        >
          <Building2 className={cn("h-4 w-4 shrink-0", accentTextClass)} />
          <span className="truncate">
            {booking.source.context} · {booking.source.locale}
          </span>
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            infoBoxClass,
          )}
        >
          <Clock3 className={cn("h-4 w-4 shrink-0", accentTextClass)} />
          <span className="truncate">{booking.event.timezoneLabel}</span>
        </div>
      </div>

      {booking.source.pageUrl ? (
        <a
          className={cn(
            "mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium hover:underline",
            accentTextClass,
          )}
          href={booking.source.pageUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{booking.source.pageUrl}</span>
        </a>
      ) : null}

      <p className="mt-3 text-xs text-muted-foreground">
        {t("Requested")} {formatDateTime(booking.createdAt, language)}
      </p>
      {isAcknowledged && booking.acknowledgedAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Acknowledged")} {formatDateTime(booking.acknowledgedAt, language)}
        </p>
      ) : null}
    </article>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid min-w-[680px] grid-cols-7 gap-2">
      {Array.from({ length: 35 }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

function ClientBookingsList({
  cursor,
  onNext,
  onPrevious,
  canGoPrevious,
}: {
  cursor?: string;
  onNext: (cursor: string) => void;
  onPrevious: () => void;
  canGoPrevious: boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const ackMutation = useAcknowledgeBooking();
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: [LIST_BOOKINGS_QUERY_KEY, cursor],
    queryFn: () => sdkFetch<ClientBookingsResponse>(buildListQueryPath(cursor)),
  });
  const bookings = data?.bookings ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {t("All booking requests")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("Latest requests first.")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          {t("Refresh")}
        </Button>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("Failed to load booking requests.")}
        </p>
      ) : null}

      {ackMutation.error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("Failed to update acknowledgment.")}
        </p>
      ) : null}

      {isFetching && bookings.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState>{t("No booking requests found.")}</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-background/64">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Meeting")}</TableHead>
                <TableHead>{t("Contact")}</TableHead>
                <TableHead>{t("Company")}</TableHead>
                <TableHead>{t("Source")}</TableHead>
                <TableHead>{t("Requested")}</TableHead>
                <TableHead>{t("Ack")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const isAcknowledging =
                  ackMutation.isPending && ackMutation.variables === booking.id;

                return (
                  <TableRow
                    key={booking.id}
                    className={cn(
                      "transition-colors",
                      booking.ack
                        ? "bg-amber-50/80 hover:bg-amber-50 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
                        : "bg-white hover:bg-slate-50 dark:bg-background/60 dark:hover:bg-muted/35",
                    )}
                  >
                    <TableCell className="whitespace-normal">
                      <div className="font-medium text-foreground">
                        {formatDateKey(booking.event.date, language)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimeRange(booking)}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium text-foreground">
                        {booking.form.fullName || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {booking.form.email || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {booking.form.whatsapp || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {booking.form.companyName || "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div>{booking.source.context}</div>
                      <div className="text-xs text-muted-foreground">
                        {booking.source.locale}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {formatDateTime(booking.createdAt, language)}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant={booking.ack ? "warning" : "outline"}>
                          {booking.ack
                            ? t("Acknowledged")
                            : t("Not acknowledged")}
                        </Badge>
                        {!booking.ack ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => ackMutation.mutate(booking.id)}
                            disabled={isAcknowledging}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {isAcknowledging
                              ? t("Saving...")
                              : t("Confirm ack")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!canGoPrevious || isFetching}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("Previous")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {bookings.length} {t("visible")}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => data?.nextCursor && onNext(data.nextCursor)}
          disabled={!data?.nextCursor || isFetching}
        >
          {t("Load more")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ClientBookingsWorkbench() {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const ackMutation = useAcknowledgeBooking();
  const [view, setView] = useState<BookingView>("calendar");
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const currentListCursor = cursorStack[cursorStack.length - 1];
  const monthCells = useMemo(() => getMonthCells(monthKey), [monthKey]);
  const calendarQuery = useQuery({
    queryKey: [CALENDAR_BOOKINGS_QUERY_KEY, monthKey],
    queryFn: () =>
      sdkFetch<ClientBookingsResponse>(buildCalendarQueryPath(monthKey)),
  });
  const calendarBookings = calendarQuery.data?.bookings ?? [];
  const bookingsByDate = useMemo(
    () => groupBookingsByDate(calendarBookings),
    [calendarBookings],
  );
  const firstBookingDate = calendarBookings.find(
    (booking) => booking.event.date,
  )?.event.date;
  const todayDateKey = getTodayDateKey();
  const effectiveSelectedDate =
    selectedDate && selectedDate.startsWith(`${monthKey}-`)
      ? selectedDate
      : (firstBookingDate ??
        (todayDateKey.startsWith(`${monthKey}-`)
          ? todayDateKey
          : `${monthKey}-01`));
  const selectedBookings = bookingsByDate.get(effectiveSelectedDate) ?? [];
  const daysWithMeetings = bookingsByDate.size;

  return (
    <section className="glass-panel flex flex-col gap-5 px-4 py-4 md:px-5">
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as BookingView)}
        className="gap-5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
              GOD MODE ACTIONS
            </p>
            <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">
              {t("See all bookings")}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderUnclutterButton />
            <TabsList className="w-fit">
              <TabsTrigger value="calendar" className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("Calendar")}
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                {t("List")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="calendar" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
            <div className="rounded-2xl border border-border/80 bg-background/60 p-4">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-heading text-lg font-semibold capitalize text-foreground">
                    {formatMonthLabel(monthKey, language)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {calendarBookings.length} {t("meetings")} ·{" "}
                    {daysWithMeetings} {t("days with meetings")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Previous month")}
                    title={t("Previous month")}
                    onClick={() =>
                      setMonthKey((current) => addMonths(current, -1))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMonthKey(getCurrentMonthKey());
                      setSelectedDate(getTodayDateKey());
                    }}
                  >
                    {t("Today")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Next month")}
                    title={t("Next month")}
                    onClick={() =>
                      setMonthKey((current) => addMonths(current, 1))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Refresh")}
                    title={t("Refresh")}
                    onClick={() => calendarQuery.refetch()}
                    disabled={calendarQuery.isFetching}
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        calendarQuery.isFetching && "animate-spin",
                      )}
                    />
                  </Button>
                </div>
              </div>

              {calendarQuery.error ? (
                <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {t("Failed to load booking requests.")}
                </p>
              ) : null}

              {ackMutation.error ? (
                <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {t("Failed to update acknowledgment.")}
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="mb-2 grid grid-cols-7 gap-2">
                    {WEEKDAYS[language].map((weekday) => (
                      <div
                        key={weekday}
                        className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        {weekday}
                      </div>
                    ))}
                  </div>

                  {calendarQuery.isFetching && calendarBookings.length === 0 ? (
                    <CalendarSkeleton />
                  ) : (
                    <div className="grid grid-cols-7 gap-2">
                      {monthCells.map((cell) => {
                        if (!cell.dateKey || !cell.day) {
                          return <div key={cell.key} className="min-h-24" />;
                        }

                        const dayBookings =
                          bookingsByDate.get(cell.dateKey) ?? [];
                        const hasBookings = dayBookings.length > 0;
                        const acknowledgedCount = dayBookings.filter(
                          (booking) => booking.ack,
                        ).length;
                        const unacknowledgedCount =
                          dayBookings.length - acknowledgedCount;
                        const allAcknowledged =
                          hasBookings && unacknowledgedCount === 0;
                        const isSelected =
                          cell.dateKey === effectiveSelectedDate;
                        const isToday = cell.dateKey === todayDateKey;

                        return (
                          <button
                            key={cell.key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              setSelectedDate(cell.dateKey ?? null)
                            }
                            className={cn(
                              "min-h-24 rounded-xl border border-transparent bg-transparent p-2 text-left transition-colors hover:border-foreground/20 hover:bg-muted/35",
                              hasBookings &&
                                !allAcknowledged &&
                                "border-slate-200/90 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)] dark:border-border/70 dark:bg-background/70",
                              allAcknowledged &&
                                "border-amber-300/70 bg-amber-50/80 shadow-[0_8px_18px_rgba(245,158,11,0.08)] dark:border-amber-300/25 dark:bg-amber-400/10",
                              isToday &&
                                !hasBookings &&
                                "border-border/80 bg-background/70",
                              isSelected &&
                                "ring-2 ring-amber-500 ring-offset-2 ring-offset-background hover:border-amber-500",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                                isSelected
                                  ? allAcknowledged
                                    ? "bg-amber-950 text-amber-50 dark:bg-amber-100 dark:text-amber-950"
                                    : "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                                  : isToday
                                    ? "bg-muted text-foreground"
                                    : "text-foreground",
                              )}
                            >
                              {cell.day}
                            </span>
                            {hasBookings ? (
                              <div className="mt-3 flex flex-col gap-1">
                                <span
                                  className={cn(
                                    "w-fit rounded-full px-2 py-0.5 text-xs font-semibold",
                                    allAcknowledged
                                      ? "bg-amber-200 text-amber-950 dark:bg-amber-300/20 dark:text-amber-100"
                                      : "border border-slate-200/90 bg-white text-slate-900 dark:border-border dark:bg-background dark:text-foreground",
                                  )}
                                >
                                  {formatAckCalendarLabel(
                                    dayBookings,
                                    language,
                                  )}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {formatTimeRange(dayBookings[0])}
                                </span>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-border/80 bg-background/60 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t("Selected day")}
                  </p>
                  <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">
                    {formatDateKey(effectiveSelectedDate, language)}
                  </h3>
                </div>
                <Badge
                  variant={selectedBookings.length ? "warning" : "outline"}
                >
                  {selectedBookings.length}
                </Badge>
              </div>

              {selectedBookings.length === 0 ? (
                <EmptyState>
                  {t("No meetings scheduled for this day.")}
                </EmptyState>
              ) : (
                <div className="flex flex-col gap-3">
                  {selectedBookings.map((booking) => (
                    <BookingInfoCard
                      key={booking.id}
                      booking={booking}
                      language={language}
                      isAcknowledging={
                        ackMutation.isPending &&
                        ackMutation.variables === booking.id
                      }
                      onAcknowledge={(bookingId) =>
                        ackMutation.mutate(bookingId)
                      }
                    />
                  ))}
                </div>
              )}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <ClientBookingsList
            cursor={currentListCursor}
            canGoPrevious={cursorStack.length > 0}
            onPrevious={() => setCursorStack((current) => current.slice(0, -1))}
            onNext={(nextCursor) =>
              setCursorStack((current) => [...current, nextCursor])
            }
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
