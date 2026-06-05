"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChecklistRecurrenceFields } from "@/components/gc-fitness/ChecklistRecurrenceFields";
import type { CoachChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";
import { updateCoachChecklistItem } from "@/lib/gc-fitness/coach-checklist-actions";

interface Props {
  item: CoachChecklistItem;
  /** The element that opens the dialog (e.g. a pencil icon button). */
  trigger: ReactNode;
  /** Linkable clients. When empty (e.g. the dashboard widget) the picker is hidden. */
  clients?: Array<{ uid: string; displayName: string }>;
}

const SELECT_CLASS =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Split a stored ISO `dueAt` into the local date/time strings the
// <input type="date"|"time"> controls expect. Empty when there's no due date.
function splitDueAt(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Shared edit dialog for a coach checklist item, used by both the dedicated
 * checklist page and the dashboard "Pendientes" widget. Uncontrolled form
 * whose defaults are reset on every open via a `key` tied to open state.
 */
export function ChecklistEditDialog({ item, trigger, clients = [] }: Props) {
  const t = useTranslations("coachChecklist");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = splitDueAt(item.dueAt);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await updateCoachChecklistItem(item.id, {
        title: String(formData.get("title") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        dueDate: String(formData.get("dueDate") ?? ""),
        dueTime: String(formData.get("dueTime") ?? ""),
        clientId: String(formData.get("clientId") ?? ""),
        recurrence: String(formData.get("recurrence") ?? "none"),
        recurrenceEndsOn: String(formData.get("recurrenceEndsOn") ?? ""),
        recurrenceWeekdays: formData
          .getAll("recurrenceWeekdays")
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n)),
        recurrenceMonthDays: formData
          .getAll("recurrenceMonthDays")
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n)),
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form
          key={open ? "open" : "closed"}
          onSubmit={handleSubmit}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor={`edit-title-${item.id}`}>{t("titleLabel")}</Label>
            <Input
              id={`edit-title-${item.id}`}
              name="title"
              required
              maxLength={160}
              defaultValue={item.title}
              placeholder={t("titlePlaceholder")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-notes-${item.id}`}>{t("notesLabel")}</Label>
            <Textarea
              id={`edit-notes-${item.id}`}
              name="notes"
              maxLength={500}
              defaultValue={item.notes ?? ""}
              placeholder={t("notesPlaceholder")}
              className="min-h-20"
            />
          </div>
          {clients.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor={`edit-client-${item.id}`}>Cliente</Label>
              <select
                id={`edit-client-${item.id}`}
                name="clientId"
                defaultValue={item.clientId ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">Sin cliente</option>
                {clients.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <ChecklistRecurrenceFields
            idPrefix={`edit-${item.id}`}
            defaults={{
              recurrence: item.recurrence,
              endsOn: item.recurrenceEndsOn,
              weekdays: item.recurrenceWeekdays,
              monthDays: item.recurrenceMonthDays,
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`edit-date-${item.id}`}>{t("dateLabel")}</Label>
              <Input
                id={`edit-date-${item.id}`}
                name="dueDate"
                type="date"
                className="h-11"
                defaultValue={initial.date}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-time-${item.id}`}>{t("timeLabel")}</Label>
              <Input
                id={`edit-time-${item.id}`}
                name="dueTime"
                type="time"
                className="h-11"
                defaultValue={initial.time}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-full">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={pending}
              className="rounded-full"
            >
              {pending ? t("saving") : t("saveCta")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
