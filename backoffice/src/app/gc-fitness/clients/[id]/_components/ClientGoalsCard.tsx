"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientGoal,
  updateClientGoal,
  type ClientGoalRow,
} from "@/lib/gc-fitness/client-goal-actions";

export function ClientGoalsCard({
  clientId,
  initialGoals,
}: {
  clientId: string;
  initialGoals: ClientGoalRow[];
}) {
  const t = useTranslations("clients.detail.goals");
  const tCommon = useTranslations("common");
  const HORIZON_LABELS: Record<ClientGoalRow["horizon"], string> = {
    short: t("horizonShort"),
    medium: t("horizonMedium"),
    long: t("horizonLong"),
  };
  const [goals, setGoals] = useState(initialGoals);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [horizon, setHorizon] =
    useState<ClientGoalRow["horizon"]>("short");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Target className="size-4" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-3">
        {goals.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          goals.map((goal) => (
            <div
              key={goal.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{goal.title}</p>
                  <Badge variant="secondary">
                    {HORIZON_LABELS[goal.horizon]}
                  </Badge>
                  <Badge
                    variant={
                      goal.status === "active" ? "outline" : "secondary"
                    }
                  >
                    {goal.status}
                  </Badge>
                </div>
                {goal.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {goal.description}
                  </p>
                ) : null}
                {goal.targetDate ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("targetPrefix", { date: goal.targetDate })}
                  </p>
                ) : null}
              </div>
              {goal.status === "active" ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      startTransition(async () => {
                        await updateClientGoal({
                          goalId: goal.id,
                          status: "completed",
                        });
                        setGoals((current) =>
                          current.map((g) =>
                            g.id === goal.id
                              ? { ...g, status: "completed" }
                              : g,
                          ),
                        );
                      })
                    }
                  >
                    {t("complete")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        await updateClientGoal({
                          goalId: goal.id,
                          status: "archived",
                        });
                        setGoals((current) =>
                          current.map((g) =>
                            g.id === goal.id
                              ? { ...g, status: "archived" }
                              : g,
                          ),
                        );
                      })
                    }
                  >
                    {t("archive")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4">
        <div className="grid gap-2 md:grid-cols-[1fr_150px_150px]">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("newPlaceholder")}
          />
          <Select
            value={horizon}
            onValueChange={(value) =>
              setHorizon(value as ClientGoalRow["horizon"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">{t("horizonShort")}</SelectItem>
              <SelectItem value="medium">{t("horizonMedium")}</SelectItem>
              <SelectItem value="long">{t("horizonLong")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </div>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("descriptionPlaceholder")}
          className="min-h-20"
          maxLength={1000}
        />
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
          <Button
            type="button"
            disabled={isPending || title.trim() === ""}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const result = await createClientGoal({
                    clientId,
                    horizon,
                    title,
                    description: description.trim() || undefined,
                    targetDate: targetDate || undefined,
                  });
                  setGoals((current) => [
                    {
                      id: result.id,
                      clientId,
                      coachId: "",
                      horizon,
                      title,
                      description: description.trim() || null,
                      targetDate: targetDate || null,
                      status: "active",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    ...current,
                  ]);
                  setTitle("");
                  setDescription("");
                  setTargetDate("");
                  setHorizon("short");
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("saveFailed"));
                }
              });
            }}
          >
            {isPending ? tCommon("saving") : t("addCta")}
          </Button>
        </div>
      </div>
    </section>
  );
}
