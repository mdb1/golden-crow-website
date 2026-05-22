"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageCircle, Filter, Dumbbell, ListChecks, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NudgeButton } from "@/app/gc-fitness/chat/_components/NudgeButton";
import type { RecentLogRow } from "@/lib/gc-fitness/recent-logs-actions";

interface Props {
  logs: RecentLogRow[];
  clients: Array<{ id: string; name: string }>;
}

export function RecentLogsFeed({ logs, clients }: Props) {
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return logs.filter((row) => {
      if (clientFilter !== "all" && row.clientId !== clientFilter) return false;
      if (typeFilter !== "all" && row.category !== typeFilter) return false;
      return true;
    });
  }, [logs, clientFilter, typeFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow activity by client and log type.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">Client</p>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Type</p>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="habit">Habits</SelectItem>
                <SelectItem value="workout">Workouts</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No logs match the current filters.
            </CardContent>
          </Card>
        ) : null}
        {filtered.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {row.category === "habit" ? (
                    <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      <ListChecks className="h-3.5 w-3.5" />
                      Habit
                    </Badge>
                  ) : (
                    <Badge className="gap-1 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50">
                      <Dumbbell className="h-3.5 w-3.5" />
                      Workout
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {row.clientName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    • {formatDateTime(row.eventAt)}
                  </span>
                </div>
                <p className="line-clamp-1 text-sm font-semibold">{row.title}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{row.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button asChild variant="outline" size="sm" className="h-8 gap-1 px-2.5">
                  <Link href={`/gc-fitness/chat?chatId=${row.clientId}`}>
                    <MessageCircle className="h-4 w-4" />
                    Open chat
                  </Link>
                </Button>
                <NudgeButton clientId={row.clientId} clientName={row.clientName} />
                {row.workoutLogId ? (
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1 px-2.5">
                    <Link href={`/gc-fitness/recent-logs/workouts/${row.workoutLogId}`}>
                      <Eye className="h-4 w-4" />
                      View workout
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
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
