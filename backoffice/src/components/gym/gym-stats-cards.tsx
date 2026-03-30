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
        title="Members"
        description="Active gym members registered in Pocket Gyms."
        value={stats.memberCount}
        href="/gym/members"
        tone="blue"
      />
      <MetricCard
        icon={Dumbbell}
        title="Active Training Plans"
        description="Training plans currently in effect across all members."
        value={stats.activeTrainingPlanCount}
        href="/gym/members"
        tone="green"
      />
      <MetricCard
        icon={Calendar}
        title="Upcoming Bookings"
        description="Confirmed bookings for future time slots."
        value={stats.upcomingBookingCount}
        href="/gym/bookings"
        tone="blue"
      />
    </div>
  );
}
