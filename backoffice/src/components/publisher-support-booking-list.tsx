"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, LoaderCircle, Video } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SUPPORT_BOOKING_REASON_LABELS } from "@/lib/client-bookings";
import { appText } from "@/lib/language";
import { PUBLISHER_PORTAL_SUPPORT_BOOKING_NEW_ROUTE } from "@/lib/publisher-portal-routes";
import { loadPublisherSupportBookingsPage } from "@/lib/publisher-support-bookings-actions";
import {
  formatSupportBookingDate,
  type PublisherSupportBookingsPage,
} from "@/lib/publisher-support-bookings";

const COPY = {
  en: {
    newBooking: "Request a meeting",
    empty: "You have no support bookings yet.",
    unavailable: "We could not load your support bookings.",
    loadMoreError: "We could not load more bookings.",
    date: "Date and time",
    reason: "Reason",
    status: "Status",
    scheduled: "Scheduled",
    requested: "Requested",
    join: "Join meeting",
  },
  es: {
    newBooking: "Solicitar reunión",
    empty: "Todavía no tenés reservas de soporte.",
    unavailable: "No pudimos cargar tus reservas de soporte.",
    loadMoreError: "No pudimos cargar más reservas.",
    date: "Fecha y hora",
    reason: "Motivo",
    status: "Estado",
    scheduled: "Agendada",
    requested: "Solicitada",
    join: "Unirme a la reunión",
  },
};

export function PublisherSupportBookingList({
  firstPage,
  publisherUid,
}: {
  firstPage: PublisherSupportBookingsPage | null;
  publisherUid: string;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const router = useRouter();
  const [pages, setPages] = useState<PublisherSupportBookingsPage[]>([]);
  const [pageLoadError, setPageLoadError] = useState(false);
  const [pending, startTransition] = useTransition();
  const bookings = (firstPage ? [firstPage, ...pages] : []).flatMap((page) => page.bookings);
  const nextCursor = (pages.at(-1) ?? firstPage)?.nextCursor;

  function loadMore() {
    if (!nextCursor || pending) return;
    setPageLoadError(false);
    startTransition(async () => {
      const page = await loadPublisherSupportBookingsPage(publisherUid, nextCursor).catch(() => null);
      if (!page) {
        setPageLoadError(true);
        return;
      }
      setPages((current) => [...current, page]);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="font-heading text-lg font-semibold">
            {appText(language, "Support bookings")}
          </h2>
          <HeaderUnclutterButton />
        </div>
        <Button asChild>
          <Link href={PUBLISHER_PORTAL_SUPPORT_BOOKING_NEW_ROUTE}>
            <CalendarPlus className="size-4" />
            {copy.newBooking}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        {!firstPage ? (
          <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-2">
            <AlertTitle>{copy.unavailable}</AlertTitle>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {appText(language, "Try again")}
            </Button>
          </Alert>
        ) : bookings.length === 0 ? (
          <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <p className="text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.date}</TableHead>
                <TableHead>{copy.reason}</TableHead>
                <TableHead>{copy.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map(({ id, reason, event, googleCalendar }) => (
                <TableRow key={id}>
                  <TableCell className="py-3">
                    <p className="font-medium first-letter:uppercase">{formatSupportBookingDate(event.date, language)}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {event.startTime}–{event.endTime} · Buenos Aires (GMT−3)
                    </p>
                  </TableCell>
                  <TableCell>
                    {reason ? SUPPORT_BOOKING_REASON_LABELS[reason]?.[language] ?? "—" : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={googleCalendar ? "success" : "secondary"}>
                        {googleCalendar ? copy.scheduled : copy.requested}
                      </Badge>
                      {googleCalendar?.meetLink?.startsWith("https://meet.google.com/") ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={googleCalendar.meetLink} target="_blank" rel="noreferrer">
                            <Video className="size-4" />
                            {copy.join}
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pageLoadError ? (
          <Alert variant="destructive"><AlertTitle>{copy.loadMoreError}</AlertTitle></Alert>
        ) : null}
        {nextCursor ? (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {appText(language, "Load more")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
