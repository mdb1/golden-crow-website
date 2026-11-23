"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { es, enUS } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Globe2,
  LoaderCircle,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useAppLanguage } from "@/components/app-language-provider";
import { HeaderUnclutterButton } from "@/components/header-unclutter";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SUPPORT_BOOKING_REASONS,
  SUPPORT_BOOKING_REASON_LABELS,
  type SupportBookingReason,
} from "@/lib/client-bookings";
import { appText } from "@/lib/language";
import {
  PUBLISHER_PORTAL_LOGIN_ROUTE,
  PUBLISHER_PORTAL_SUPPORT_BOOKINGS_ROUTE,
  PUBLISHER_PORTAL_SUPPORT_BOOKING_NEW_ROUTE,
} from "@/lib/publisher-portal-routes";
import {
  formatSupportBookingDate,
  PUBLISHER_SUPPORT_BOOKING_API,
  SUPPORT_BOOKING_TIMEZONE,
  type PublisherSupportBookingAvailability,
} from "@/lib/publisher-support-bookings";
import { sdkFetch, SdkRequestError } from "@/lib/sdk-client";
import {
  EXPECTED_SESSION_EMAIL_HEADER,
  EXPECTED_SESSION_PROJECT_HEADER,
  EXPECTED_SESSION_SURFACE_HEADER,
  EXPECTED_SESSION_UID_HEADER,
  type SdkSessionIdentity,
} from "@/lib/sdk-session-recovery";

const COPY = {
  en: {
    chooseDate: "Choose a date and time",
    details: "Meeting details",
    back: "Back to support bookings",
    changeTime: "Change date or time",
    timeZone: "Buenos Aires (GMT−3)",
    duration: "30 minutes",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    availableTimes: "Available times",
    noTimes: "No times are available this month. Try another month.",
    availabilityError: "We could not load the available times.",
    conflict: "That time is no longer available. Choose another one.",
    submitError: "We could not request your meeting. Try again.",
    sessionError: "Your session expired. Sign in again to continue.",
    signIn: "Sign in",
    email: "Confirmation email",
    reason: "Reason",
    selectReason: "Choose a reason",
    whatsapp: "WhatsApp number (optional)",
    whatsappPlaceholder: "Your number including country code",
    submit: "Request meeting",
    submitting: "Requesting meeting…",
    success: "Thanks for booking!",
    successDetail: "Your support booking is reserved for",
  },
  es: {
    chooseDate: "Seleccioná fecha y hora",
    details: "Datos de la reunión",
    back: "Volver a reservas de soporte",
    changeTime: "Cambiar fecha u horario",
    timeZone: "Buenos Aires (GMT−3)",
    duration: "30 minutos",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    availableTimes: "Horarios disponibles",
    noTimes: "No hay horarios disponibles este mes. Probá con otro mes.",
    availabilityError: "No pudimos cargar los horarios disponibles.",
    conflict: "Ese horario ya no está disponible. Elegí otro.",
    submitError: "No pudimos solicitar tu reunión. Volvé a intentar.",
    sessionError: "Tu sesión venció. Iniciá sesión para continuar.",
    signIn: "Iniciar sesión",
    email: "Correo de confirmación",
    reason: "Motivo",
    selectReason: "Seleccioná un motivo",
    whatsapp: "Número de WhatsApp (opcional)",
    whatsappPlaceholder: "Tu número con código de país",
    submit: "Solicitar reunión",
    submitting: "Enviando solicitud…",
    success: "¡Gracias por reservar!",
    successDetail: "Tu reserva de soporte quedó registrada para el",
  },
};

type Slot = { date: string; startTime: string };
type SubmissionError = "conflict" | "sessionError" | "submitError";

function calendarDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function calendarDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function bookingCalendarBounds() {
  const todayKey = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SUPPORT_BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const today = calendarDate(todayKey);
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() + 1);
  while (earliest.getDay() === 0 || earliest.getDay() === 6) {
    earliest.setDate(earliest.getDate() + 1);
  }

  return { earliest, today };
}

export function PublisherSupportBookingNew({
  identity,
  requestedSlot,
  requestedReason,
}: {
  identity: SdkSessionIdentity;
  requestedSlot?: Slot;
  requestedReason?: SupportBookingReason;
}) {
  const { language } = useAppLanguage();
  const router = useRouter();
  const copy = COPY[language];
  const [bounds] = useState(bookingCalendarBounds);
  const [month, setMonth] = useState(() => requestedSlot && requestedSlot.date >= calendarDateKey(bounds.earliest)
    ? calendarDate(requestedSlot.date)
    : bounds.earliest);
  const [preferredDate, setPreferredDate] = useState(requestedSlot?.date);
  const [selection, setSelection] = useState<Slot | "invitation" | undefined>(requestedSlot ? "invitation" : undefined);
  const [reason, setReason] = useState<SupportBookingReason | "">(requestedReason ?? (requestedSlot ? "other" : ""));
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submissionError, setSubmissionError] = useState<SubmissionError>();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const monthKey = calendarDateKey(month).slice(0, 7);
  const availability = useQuery({
    queryKey: ["support-booking-availability", monthKey],
    staleTime: 0,
    retry: 1,
    queryFn: ({ signal }) => sdkFetch<PublisherSupportBookingAvailability>(
      `/client-bookings/availability?month=${monthKey}&context=pocket-genes-support`,
      { signal },
    ),
  });

  const checkingInvitation = selection === "invitation" && !availability.isFetchedAfterMount;
  const availabilityLoading = availability.isPending || checkingInvitation || (submissionError === "conflict" && availability.isFetching);
  const slotsByDate = availabilityLoading ? undefined : availability.data?.slotsByDate;
  const invitedSlotAvailable = requestedSlot && availability.isSuccess &&
    slotsByDate?.[requestedSlot.date]?.includes(requestedSlot.startTime);
  const slot = selection === "invitation" ? (invitedSlotAvailable ? requestedSlot : undefined) : selection;
  const invitationUnavailable = selection === "invitation" && availability.isSuccess && !checkingInvitation && !slot;
  const selectedDate = preferredDate && slotsByDate?.[preferredDate]?.length
    ? preferredDate
    : Object.keys(slotsByDate ?? {}).filter((date) => slotsByDate?.[date]?.length).sort()[0];
  const selectedTimes = selectedDate ? slotsByDate?.[selectedDate] ?? [] : [];

  function focusStepTitle() {
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function chooseTime(date: string, startTime: string) {
    setSelection({ date, startTime });
    setSubmissionError(undefined);
    focusStepTitle();
  }

  function changeTime() {
    setSelection(undefined);
    setSubmissionError(undefined);
    focusStepTitle();
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !reason || submitting) return;
    setSelection(slot);
    setSubmitting(true);
    setSubmissionError(undefined);

    try {
      await sdkFetch<{ status: "ok"; bookingId: string }>(PUBLISHER_SUPPORT_BOOKING_API, {
        method: "POST",
        headers: {
          [EXPECTED_SESSION_UID_HEADER]: identity.uid,
          [EXPECTED_SESSION_EMAIL_HEADER]: identity.email,
          [EXPECTED_SESSION_PROJECT_HEADER]: identity.project,
          [EXPECTED_SESSION_SURFACE_HEADER]: identity.surface,
        },
        body: JSON.stringify({
          ...slot,
          reason,
          locale: language,
          whatsapp: whatsapp.trim() || undefined,
        }),
      });
      setCompleted(true);
    } catch (error) {
      const status = error instanceof SdkRequestError ? error.status : undefined;
      if (status === 409) {
        setSelection(undefined);
        setSubmissionError("conflict");
        void availability.refetch();
        focusStepTitle();
      } else {
        setSubmissionError(status === 401 || status === 403 ? "sessionError" : "submitError");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (completed && slot) {
    return (
      <Dialog open onOpenChange={(open) => {
        if (!open) router.replace(PUBLISHER_PORTAL_SUPPORT_BOOKINGS_ROUTE);
      }}>
        <DialogPortal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[2199] bg-black/45" />
          <DialogPrimitive.Content className="publisher-app-success-overlay fixed inset-0 z-[2200] grid place-items-center overflow-y-auto px-5 py-8 text-white outline-none sm:px-12">
            <span aria-hidden="true" className="publisher-app-success-circle pointer-events-none fixed left-1/2 top-1/2 size-9 rounded-full bg-emerald-700" />
            <div className="publisher-app-success-content relative z-10 w-full max-w-3xl text-center">
              <div aria-hidden="true" className="mx-auto grid size-20 place-items-center rounded-full bg-white/15 ring-1 ring-white/35">
                <Check className="size-10" strokeWidth={2.7} />
              </div>
              <DialogTitle className="mt-6 font-heading text-4xl font-bold text-white sm:text-5xl">{copy.success}</DialogTitle>
              <DialogDescription className="mt-4 text-lg text-white">
                {copy.successDetail} {formatSupportBookingDate(slot.date, language)} · {slot.startTime} ({copy.timeZone}).
              </DialogDescription>
              <Button
                asChild
                size="lg"
                className="mt-8 h-12 rounded-full bg-white px-6 font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                <Link href={PUBLISHER_PORTAL_SUPPORT_BOOKINGS_ROUTE} prefetch={false}>
                  <ArrowLeft className="size-4" />
                  {copy.back}
                </Link>
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <h2 ref={titleRef} tabIndex={-1} className="font-heading text-lg font-semibold outline-none">
            {slot ? copy.details : copy.chooseDate}
          </h2>
          <HeaderUnclutterButton />
        </div>
        <Button variant="ghost" asChild>
          <Link href={PUBLISHER_PORTAL_SUPPORT_BOOKINGS_ROUTE} prefetch={false}>
            <ArrowLeft className="size-4" />
            {copy.back}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {slot ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
            <div className="h-fit space-y-4 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
              <div className="flex gap-2.5">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="font-semibold first-letter:uppercase">{formatSupportBookingDate(slot.date, language)}</p>
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {slot.startTime} · {copy.duration}
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Globe2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {copy.timeZone}
              </div>
              <Button type="button" variant="outline" onClick={changeTime} disabled={submitting}>
                <ArrowLeft className="size-4" />
                {copy.changeTime}
              </Button>
            </div>
            <form onSubmit={submitBooking} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="support-booking-confirmation-address">{copy.email}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input id="support-booking-confirmation-address" type="email" readOnly value={identity.email} className="h-11 pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-booking-reason">{copy.reason}</Label>
                <Select value={reason} onValueChange={(value: SupportBookingReason) => setReason(value)} required disabled={submitting}>
                  <SelectTrigger id="support-booking-reason" className="w-full data-[size=default]:h-11">
                    <SelectValue placeholder={copy.selectReason} />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_BOOKING_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>{SUPPORT_BOOKING_REASON_LABELS[value][language]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-booking-whatsapp">{copy.whatsapp}</Label>
                <Input
                  id="support-booking-whatsapp"
                  type="tel"
                  autoComplete="tel"
                  minLength={5}
                  maxLength={50}
                  placeholder={copy.whatsappPlaceholder}
                  value={whatsapp}
                  disabled={submitting}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  className="h-11"
                />
              </div>
              {submissionError ? (
                <Alert variant="destructive" className="space-y-1">
                  <AlertTitle>{copy[submissionError]}</AlertTitle>
                  {submissionError === "sessionError" ? (
                    <Link
                      className="w-fit font-medium underline"
                      href={{
                        pathname: PUBLISHER_PORTAL_LOGIN_ROUTE,
                        query: { callbackUrl: `${PUBLISHER_PORTAL_SUPPORT_BOOKING_NEW_ROUTE}?${new URLSearchParams({ ...slot, category: reason })}` },
                      }}
                    >
                      {copy.signIn}
                    </Link>
                  ) : null}
                </Alert>
              ) : null}
              <div className="flex justify-end">
                <Button type="submit" size="lg" className="h-11 px-4" disabled={!reason || submitting}>
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
                  {submitting ? copy.submitting : copy.submit}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {submissionError === "conflict" || invitationUnavailable ? (
              <Alert variant="destructive"><AlertTitle>{copy.conflict}</AlertTitle></Alert>
            ) : null}
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
              <div className="rounded-xl border border-border p-3 sm:p-4">
                <Calendar
                  mode="single"
                  locale={language === "es" ? es : enUS}
                  month={month}
                  onMonthChange={(nextMonth) => {
                    setMonth(nextMonth);
                    setSelection(undefined);
                    setSubmissionError(undefined);
                  }}
                  today={bounds.today}
                  startMonth={bounds.earliest}
                  showOutsideDays={false}
                  weekStartsOn={0}
                  labels={{ labelPrevious: () => copy.previousMonth, labelNext: () => copy.nextMonth }}
                  selected={selectedDate ? calendarDate(selectedDate) : undefined}
                  onSelect={(day) => {
                    if (day) {
                      setSelection(undefined);
                      setPreferredDate(calendarDateKey(day));
                    }
                  }}
                  disabled={(day) => !slotsByDate?.[calendarDateKey(day)]?.length}
                  className="w-full bg-transparent p-0 [--cell-size:--spacing(10)]"
                />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe2 className="size-4" aria-hidden="true" /> {copy.timeZone}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-4" aria-hidden="true" /> {copy.duration}
                  </span>
                </div>
              </div>
              <section className="rounded-xl border border-border p-4 sm:p-5" aria-busy={availabilityLoading}>
                <h3 className="font-heading text-base font-semibold">{copy.availableTimes}</h3>
                {availability.isError ? (
                  <div className="mt-3 space-y-2">
                    <Alert variant="destructive"><AlertTitle>{copy.availabilityError}</AlertTitle></Alert>
                    <Button variant="outline" disabled={availability.isFetching} onClick={() => void availability.refetch()}>
                      {appText(language, "Try again")}
                    </Button>
                  </div>
                ) : availabilityLoading ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10" />)}
                  </div>
                ) : selectedDate && selectedTimes.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase" aria-live="polite">
                      {formatSupportBookingDate(selectedDate, language)}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
                      {selectedTimes.map((time) => (
                        <Button key={time} variant="outline" className="h-10 font-semibold text-primary hover:border-primary/50 hover:text-primary" onClick={() => chooseTime(selectedDate, time)}>
                          {time}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{copy.noTimes}</p>
                )}
              </section>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
