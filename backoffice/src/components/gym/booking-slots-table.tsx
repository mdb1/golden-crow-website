"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

interface BookingSlotRecord {
  id: string;
  gymId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "class" | "session";
  title: string;
  maxCapacity: number;
  currentCount: number;
  trainerId?: string;
  createdAt: string;
  updatedAt: string;
}

interface SlotFormState {
  title: string;
  type: "class" | "session";
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  trainerId: string;
}

function emptyForm(): SlotFormState {
  return { title: "", type: "session", date: "", startTime: "", endTime: "", maxCapacity: 1, trainerId: "" };
}

function slotToForm(slot: BookingSlotRecord): SlotFormState {
  return {
    title: slot.title,
    type: slot.type,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    maxCapacity: slot.maxCapacity,
    trainerId: slot.trainerId ?? "",
  };
}

const GYM_ID = "prolife360";

export function BookingSlotsTable() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<BookingSlotRecord | null>(null);
  const [form, setForm] = useState<SlotFormState>(emptyForm());
  const [maxCapacityDraft, setMaxCapacityDraft] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gym-booking-slots"],
    queryFn: () => sdkFetch<{ slots: BookingSlotRecord[] }>(`/gym/booking-slots/${GYM_ID}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gym-booking-slots"] });

  const createMutation = useMutation({
    mutationFn: (body: SlotFormState) =>
      sdkFetch(`/gym/booking-slots/${GYM_ID}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to create slot."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ slotId, body }: { slotId: string; body: SlotFormState }) =>
      sdkFetch(`/gym/booking-slots/${GYM_ID}/${slotId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to update slot."),
  });

  const deleteMutation = useMutation({
    mutationFn: (slotId: string) =>
      sdkFetch(`/gym/booking-slots/${GYM_ID}/${slotId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to delete slot."),
  });

  function openCreate() {
    setEditingSlot(null);
    const next = emptyForm();
    setForm(next);
    setMaxCapacityDraft(String(next.maxCapacity));
    setFormError(null);
    setDialogOpen(true);
  }
  function openEdit(slot: BookingSlotRecord) {
    setEditingSlot(slot);
    const next = slotToForm(slot);
    setForm(next);
    setMaxCapacityDraft(String(next.maxCapacity));
    setFormError(null);
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditingSlot(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (editingSlot) {
      updateMutation.mutate({ slotId: editingSlot.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Failed to load coach availability.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add availability
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Title</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Date</th>
            <th className="pb-2 pr-4 font-medium">Start</th>
            <th className="pb-2 pr-4 font-medium">Booked / capacity</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {(data?.slots ?? []).length === 0 && (
            <tr><td colSpan={6} className="py-4 text-muted-foreground">No coach availability slots yet.</td></tr>
          )}
          {(data?.slots ?? []).map((slot) => (
            <tr key={slot.id} className="border-b last:border-0">
              <td className="py-2 pr-4">{slot.title}</td>
              <td className="py-2 pr-4"><Badge variant="secondary">{slot.type}</Badge></td>
              <td className="py-2 pr-4 text-muted-foreground">{new Date(slot.date).toLocaleDateString()}</td>
              <td className="py-2 pr-4 text-muted-foreground">{new Date(slot.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
              <td className="py-2 pr-4 text-muted-foreground">{slot.currentCount}/{slot.maxCapacity}</td>
              <td className="py-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(slot)}>Edit</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSlot ? "Edit availability" : "New availability"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
            <div className="space-y-1"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as "class" | "session" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Session</SelectItem>
                  <SelectItem value="class">Class</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start time</Label><Input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required /></div>
              <div className="space-y-1"><Label>End time</Label><Input type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required /></div>
            </div>
            <div className="space-y-1">
              <Label>Max capacity</Label>
              <Input
                type="number"
                min={1}
                value={maxCapacityDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  setMaxCapacityDraft(raw);
                  if (raw.trim() === "") return;
                  const parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  setForm((f) => ({ ...f, maxCapacity: parsed }));
                }}
                onBlur={() => {
                  if (maxCapacityDraft.trim() === "") {
                    setMaxCapacityDraft(String(form.maxCapacity));
                    return;
                  }
                  const parsed = Number(maxCapacityDraft);
                  if (!Number.isFinite(parsed)) {
                    setMaxCapacityDraft(String(form.maxCapacity));
                    return;
                  }
                  const normalized = Math.max(1, parsed);
                  setForm((f) => ({ ...f, maxCapacity: normalized }));
                  setMaxCapacityDraft(String(normalized));
                }}
                required
              />
            </div>
            <div className="space-y-1"><Label>Trainer ID (optional)</Label><Input value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))} /></div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={isMutating}>{isMutating ? "Saving..." : editingSlot ? "Save changes" : "Create availability"}</Button>
              {editingSlot && (
                <Button type="button" variant="destructive" onClick={() => deleteMutation.mutate(editingSlot.id)} disabled={isMutating}>
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
