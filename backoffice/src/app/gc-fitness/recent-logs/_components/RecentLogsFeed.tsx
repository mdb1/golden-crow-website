"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  MessageCircle,
  Filter,
  Dumbbell,
  Gauge,
  ListChecks,
  Eye,
  Camera,
  Scale,
  StickyNote,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecentLogRow } from "@/lib/gc-fitness/recent-logs-actions";

interface Props {
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string }>;
}

// Category → icon + label key. NEUTRAL: one muted `secondary` badge per the
// backoffice style — no per-category colors.
const CATEGORY_ICON: Record<
  RecentLogRow["category"],
  ComponentType<{ className?: string }>
> = {
  habit: ListChecks,
  workout: Dumbbell,
  reschedule: ArrowRightLeft,
  photo: Camera,
  weight: Scale,
  signup: User,
};
const CATEGORY_LABEL_KEY: Record<RecentLogRow["category"], string> = {
  habit: "badgeHabit",
  workout: "badgeWorkout",
  reschedule: "badgeReschedule",
  photo: "badgePhoto",
  weight: "badgeWeight",
  signup: "badgeSignup",
};

export function RecentLogsFeed({ logs, clients }: Props) {
  const t = useTranslations("recentLogs.feed");
  const router = useRouter();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const rows = logs.filter((row) => {
      if (clientFilter !== "all" && row.clientId !== clientFilter) return false;
      if (typeFilter !== "all" && row.category !== typeFilter) return false;
      return true;
    });
    rows.sort((a, b) => {
      const ams = Date.parse(a.eventAt);
      const bms = Date.parse(b.eventAt);
      const an = Number.isNaN(ams) ? 0 : ams;
      const bn = Number.isNaN(bms) ? 0 : bms;
      return bn - an;
    });
    return rows;
  }, [logs, clientFilter, typeFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            {t("filtersTitle")}
          </CardTitle>
          <CardDescription>{t("filtersDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-4xl gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("clientLabel")}</p>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="min-w-[14rem]">
                <SelectValue placeholder={t("allClients")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allClients")}</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("typeLabel")}</p>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="min-w-[14rem]">
                <SelectValue placeholder={t("allActivity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allActivity")}</SelectItem>
                <SelectItem value="habit">{t("habitsOption")}</SelectItem>
                <SelectItem value="workout">{t("workoutsOption")}</SelectItem>
                <SelectItem value="reschedule">
                  {t("reschedulesOption")}
                </SelectItem>
                <SelectItem value="photo">{t("photosOption")}</SelectItem>
                <SelectItem value="weight">{t("weightOption")}</SelectItem>
                <SelectItem value="signup">{t("signupOption")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("noLogs")}
            </CardContent>
          </Card>
        ) : null}
        {filtered.map((row) => {
          const CatIcon = CATEGORY_ICON[row.category];
          const openProfile = () =>
            router.push(`/gc-fitness/clients/${row.clientId}`);
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={openProfile}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openProfile();
                }
              }}
              className="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="gap-1 px-1.5 py-0 text-[11px] font-normal [&>svg]:size-3 [&>svg]:opacity-70"
                  >
                    {CatIcon ? <CatIcon /> : null}
                    {t(CATEGORY_LABEL_KEY[row.category])}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {row.title}
                  </span>
                  {row.workout?.rpe != null ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
                    >
                      <Gauge />
                      RPE {row.workout.rpe}
                    </Badge>
                  ) : null}
                  {row.workout?.hasNotes ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground [&>svg]:size-3 [&>svg]:opacity-70"
                    >
                      <StickyNote />
                      {t("notesBadge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.clientName} · {formatDateTime(row.eventAt)}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </div>
              {/* Actions — small icon buttons; stop card-click propagation. */}
              <div
                className="flex shrink-0 items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  title={t("openChat")}
                >
                  <Link href={`/gc-fitness/chat?chatId=${row.clientId}`}>
                    <MessageCircle className="h-4 w-4" />
                    <span className="sr-only">{t("openChat")}</span>
                  </Link>
                </Button>
                {row.workoutLogId ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={t("viewWorkout")}
                  >
                    <Link
                      href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">{t("viewWorkout")}</span>
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
