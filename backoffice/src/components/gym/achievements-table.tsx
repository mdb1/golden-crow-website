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

type AchievementTriggerType = "workoutCount" | "attendanceStreak" | "evaluationMilestone" | "profileComplete";

interface AchievementRecord {
  id: string;
  name: string;
  description: string;
  iconName: string;
  xpReward: number;
  triggerType: AchievementTriggerType;
  triggerThreshold: number;
}

interface AchievementFormState {
  name: string;
  description: string;
  iconName: string;
  xpReward: number;
  triggerType: AchievementTriggerType;
  triggerThreshold: number;
}

function emptyForm(): AchievementFormState {
  return { name: "", description: "", iconName: "", xpReward: 10, triggerType: "workoutCount", triggerThreshold: 1 };
}

function recordToForm(r: AchievementRecord): AchievementFormState {
  return { name: r.name, description: r.description, iconName: r.iconName, xpReward: r.xpReward, triggerType: r.triggerType, triggerThreshold: r.triggerThreshold };
}

const TRIGGER_TYPE_LABELS: Record<AchievementTriggerType, string> = {
  workoutCount: "Workout count",
  attendanceStreak: "Attendance streak",
  evaluationMilestone: "Evaluation milestone",
  profileComplete: "Profile complete",
};

export function AchievementsTable() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AchievementRecord | null>(null);
  const [form, setForm] = useState<AchievementFormState>(emptyForm());
  const [xpRewardDraft, setXpRewardDraft] = useState<string>("");
  const [triggerThresholdDraft, setTriggerThresholdDraft] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gym-achievements"],
    queryFn: () => sdkFetch<{ achievements: AchievementRecord[] }>("/gym/achievements"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gym-achievements"] });

  const createMutation = useMutation({
    mutationFn: (body: AchievementFormState) => sdkFetch("/gym/achievements", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to create achievement."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AchievementFormState }) => sdkFetch(`/gym/achievements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to update achievement."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sdkFetch(`/gym/achievements/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); closeDialog(); },
    onError: () => setFormError("Failed to delete achievement."),
  });

  function openCreate() {
    setEditing(null);
    const next = emptyForm();
    setForm(next);
    setXpRewardDraft(String(next.xpReward));
    setTriggerThresholdDraft(String(next.triggerThreshold));
    setFormError(null);
    setDialogOpen(true);
  }
  function openEdit(r: AchievementRecord) {
    setEditing(r);
    const next = recordToForm(r);
    setForm(next);
    setXpRewardDraft(String(next.xpReward));
    setTriggerThresholdDraft(String(next.triggerThreshold));
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
  if (error) return <p className="text-sm text-destructive">Failed to load achievements.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add Achievement</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 pr-4 font-medium">Name</th>
          <th className="pb-2 pr-4 font-medium">Trigger</th>
          <th className="pb-2 pr-4 font-medium">Threshold</th>
          <th className="pb-2 pr-4 font-medium">XP</th>
          <th className="pb-2 font-medium" />
        </tr></thead>
        <tbody>
          {(data?.achievements ?? []).length === 0 && (
            <tr><td colSpan={5} className="py-4 text-muted-foreground">No achievements defined yet.</td></tr>
          )}
          {(data?.achievements ?? []).map((ach) => (
            <tr key={ach.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{ach.name}</td>
              <td className="py-2 pr-4"><Badge variant="secondary">{TRIGGER_TYPE_LABELS[ach.triggerType]}</Badge></td>
              <td className="py-2 pr-4 text-muted-foreground">{ach.triggerThreshold}</td>
              <td className="py-2 pr-4 text-muted-foreground">{ach.xpReward} XP</td>
              <td className="py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(ach)}>Edit</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Achievement" : "New Achievement"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required /></div>
            <div className="space-y-1"><Label>Icon name</Label><Input value={form.iconName} onChange={(e) => setForm((f) => ({ ...f, iconName: e.target.value }))} placeholder="star.fill" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>XP reward</Label>
                <Input
                  type="number"
                  min={0}
                  value={xpRewardDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setXpRewardDraft(raw);
                    if (raw.trim() === "") return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    setForm((f) => ({ ...f, xpReward: parsed }));
                  }}
                  onBlur={() => {
                    if (xpRewardDraft.trim() === "") {
                      setXpRewardDraft(String(form.xpReward));
                      return;
                    }
                    const parsed = Number(xpRewardDraft);
                    if (!Number.isFinite(parsed)) {
                      setXpRewardDraft(String(form.xpReward));
                      return;
                    }
                    const normalized = Math.max(0, parsed);
                    setForm((f) => ({ ...f, xpReward: normalized }));
                    setXpRewardDraft(String(normalized));
                  }}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Threshold</Label>
                <Input
                  type="number"
                  min={1}
                  value={triggerThresholdDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTriggerThresholdDraft(raw);
                    if (raw.trim() === "") return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    setForm((f) => ({ ...f, triggerThreshold: parsed }));
                  }}
                  onBlur={() => {
                    if (triggerThresholdDraft.trim() === "") {
                      setTriggerThresholdDraft(String(form.triggerThreshold));
                      return;
                    }
                    const parsed = Number(triggerThresholdDraft);
                    if (!Number.isFinite(parsed)) {
                      setTriggerThresholdDraft(String(form.triggerThreshold));
                      return;
                    }
                    const normalized = Math.max(1, parsed);
                    setForm((f) => ({ ...f, triggerThreshold: normalized }));
                    setTriggerThresholdDraft(String(normalized));
                  }}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Trigger type</Label>
              <Select value={form.triggerType} onValueChange={(v) => setForm((f) => ({ ...f, triggerType: v as AchievementTriggerType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="workoutCount">Workout count</SelectItem>
                  <SelectItem value="attendanceStreak">Attendance streak</SelectItem>
                  <SelectItem value="evaluationMilestone">Evaluation milestone</SelectItem>
                  <SelectItem value="profileComplete">Profile complete</SelectItem>
                </SelectContent>
              </Select>
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
