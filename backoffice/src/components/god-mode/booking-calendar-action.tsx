"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus, ExternalLink, LoaderCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ClientBookingRecord } from "@/lib/client-bookings";
import { appText, type AppLanguage } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

export function BookingCalendarAction({
  booking,
  language,
  meetingTime,
  onCreated,
}: {
  booking: ClientBookingRecord;
  language: AppLanguage;
  meetingTime: string;
  onCreated: () => void;
}) {
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const { data, error, isPending, mutate, reset } = useMutation({
    mutationFn: () =>
      sdkFetch<{ booking: ClientBookingRecord }>(
        `/admin/client-bookings/${encodeURIComponent(booking.id)}/google-calendar`,
        { method: "POST" },
      ),
    onSuccess: () => {
      setOpen(false);
      onCreated();
    },
  });
  const calendar = booking.googleCalendar ?? data?.booking.googleCalendar;

  if (calendar) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={calendar.htmlLink} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            {t("Open Google Calendar")}
          </a>
        </Button>
        {calendar.meetLink ? (
          <Button asChild variant="outline" size="sm">
            <a href={calendar.meetLink} target="_blank" rel="noreferrer">
              <Video className="size-3.5" />
              {t("Open Google Meet")}
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  if (booking.archived) return null;

  function changeOpen(next: boolean) {
    if (isPending) return;
    reset();
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarPlus className="size-3.5" />
          {t("Create Google Calendar meeting")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{t("Create Google Calendar meeting")}</DialogTitle>
          <DialogDescription>
            {t("Google Calendar will email an invitation to the attendee.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 rounded-lg border bg-muted/30 p-3">
          <p className="font-medium">{booking.form.fullName}</p>
          <p className="break-all text-muted-foreground">{booking.form.email}</p>
          <p>{meetingTime}</p>
          <p className="text-muted-foreground">{booking.event.timezoneLabel}</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => changeOpen(false)}>
            {t("Cancel")}
          </Button>
          <Button type="button" disabled={isPending} onClick={() => mutate()}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isPending ? t("Creating meeting...") : t("Create and invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
