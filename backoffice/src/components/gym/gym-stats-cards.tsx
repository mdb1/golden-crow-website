"use client";

import { Users, Dumbbell, Calendar } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

interface GymStatsRecord {
  memberCount: number;
  activeTrainingPlanCount: number;
  upcomingBookingCount: number;
}

export function GymStatsCards({ stats }: { stats: GymStatsRecord }) {
  return (
    <div className="grid gap-3">
      <MetricCard
        icon={Users}
        title="Athletes"
        description="Active athletes available for coach follow-up."
        value={stats.memberCount}
        href="/gym/members"
        tone="blue"
      />
      <MetricCard
        icon={Dumbbell}
        title="Active coaching plans"
        description="Training plans currently in effect across the athlete roster."
        value={stats.activeTrainingPlanCount}
        href="/gym/members"
        tone="green"
      />
      <MetricCard
        icon={Calendar}
        title="Upcoming sessions"
        description="Confirmed athlete sessions for future time slots."
        value={stats.upcomingBookingCount}
        href="/gym/bookings"
        tone="blue"
      />
    </div>
  );
}
