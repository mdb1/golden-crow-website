"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

type ChallengeType = "workoutCount" | "attendanceStreak" | "nutritionCompliance";

interface ChallengeRecord {
  id: string;
  gymId: string;
  name: string;
  description: string;
  targetValue: number;
  deadline: string;
  type: ChallengeType;
}

interface ChallengeFormState {
  name: string;
  description: string;
  type: ChallengeType;
  targetValue: number;
  deadline: string;
}

function emptyForm(): ChallengeFormState {
  return { name: "", description: "", type: "workoutCount", targetValue: 10, deadline: "" };
}

function recordToForm(r: ChallengeRecord): ChallengeFormState {
  return { name: r.name, description: r.description, type: r.type, targetValue: r.targetValue, deadline: r.deadline };
}

const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  workoutCount: "Workout count",
  attendanceStreak: "Attendance streak",
  nutritionCompliance: "Nutrition compliance",
};

export function ChallengesTable() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChallengeRecord | null>(null);
  const [form, setForm] = useState<ChallengeFormState>(emptyForm());
  const [targetValueDraft, setTargetValueDraft] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gym-challenges"],
    queryFn: () => sdkFetch<{ challenges: ChallengeRecord[] }>("/gym/challenges"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gym-challenges"] });

  const createMutation = useMutation({
    mutationFn: (body: ChallengeFormState) => sdkFetch("/gym/challenges", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to create challenge."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ChallengeFormState }) => sdkFetch(`/gym/challenges/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to update challenge."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sdkFetch(`/gym/challenges/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to delete challenge."),
  });

  function openCreate() {
    setEditing(null);
    const next = emptyForm();
    setForm(next);
    setTargetValueDraft(String(next.targetValue));
    setFormError(null);
    setDialogOpen(true);
  }
  function openEdit(r: ChallengeRecord) {
    setEditing(r);
    const next = recordToForm(r);
    setForm(next);
    setTargetValueDraft(String(next.targetValue));
    setFormError(null);
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (editing) { updateMutation.mutate({ id: editing.id, body: form }); }
    else { createMutation.mutate(form); }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Failed to load challenges.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add Challenge</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 pr-4 font-medium">Name</th>
          <th className="pb-2 pr-4 font-medium">Type</th>
          <th className="pb-2 pr-4 font-medium">Target</th>
          <th className="pb-2 pr-4 font-medium">Deadline</th>
          <th className="pb-2 font-medium" />
        </tr></thead>
        <tbody>
          {(data?.challenges ?? []).length === 0 && (
            <tr><td colSpan={5} className="py-4 text-muted-foreground">No challenges defined yet.</td></tr>
          )}
          {(data?.challenges ?? []).map((ch) => (
            <tr key={ch.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{ch.name}</td>
              <td className="py-2 pr-4"><Badge variant="secondary">{CHALLENGE_TYPE_LABELS[ch.type]}</Badge></td>
              <td className="py-2 pr-4 text-muted-foreground">{ch.targetValue}</td>
              <td className="py-2 pr-4 text-muted-foreground">{new Date(ch.deadline).toLocaleDateString()}</td>
              <td className="py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(ch)}>Edit</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Challenge" : "New Challenge"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required /></div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as ChallengeType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="workoutCount">Workout count</SelectItem>
                  <SelectItem value="attendanceStreak">Attendance streak</SelectItem>
                  <SelectItem value="nutritionCompliance">Nutrition compliance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Target value</Label>
                <Input
                  type="number"
                  min={1}
                  value={targetValueDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTargetValueDraft(raw);
                    if (raw.trim() === "") return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    setForm((f) => ({ ...f, targetValue: parsed }));
                  }}
                  onBlur={() => {
                    if (targetValueDraft.trim() === "") {
                      setTargetValueDraft(String(form.targetValue));
                      return;
                    }
                    const parsed = Number(targetValueDraft);
                    if (!Number.isFinite(parsed)) {
                      setTargetValueDraft(String(form.targetValue));
                      return;
                    }
                    const normalized = Math.max(1, parsed);
                    setForm((f) => ({ ...f, targetValue: normalized }));
                    setTargetValueDraft(String(normalized));
                  }}
                  required
                />
              </div>
              <div className="space-y-1"><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} required /></div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={isMutating}>{isMutating ? "Saving..." : editing ? "Save changes" : "Create"}</Button>
              {editing && <Button type="button" variant="destructive" onClick={() => deleteMutation.mutate(editing.id)} disabled={isMutating}>{deleteMutation.isPending ? "Deleting..." : "Delete"}</Button>}
              <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
