"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BookingRecord {
  id: string;
  slotId: string;
  userId: string;
  gymId: string;
  status: "confirmed" | "cancelled";
  bookedAt: string;
  cancelledAt?: string;
}

export function BookingsTable() {
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "cancelled">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["gym-bookings"],
    queryFn: () => sdkFetch<{ bookings: BookingRecord[] }>("/gym/bookings"),
  });

  const bookings = (data?.bookings ?? []).filter(
    (b) => statusFilter === "all" || b.status === statusFilter
  );

  if (isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Failed to load session requests.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter by status:</span>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{bookings.length} session requests</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Slot ID</th>
            <th className="pb-2 pr-4 font-medium">Athlete ID</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 font-medium">Booked At</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-muted-foreground">No session requests found.</td></tr>
          )}
          {bookings.map((booking) => (
            <tr key={booking.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{booking.slotId}</td>
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{booking.userId}</td>
              <td className="py-2 pr-4">
                <Badge variant={booking.status === "confirmed" ? "default" : "secondary"}>
                  {booking.status}
                </Badge>
              </td>
              <td className="py-2 text-muted-foreground">{new Date(booking.bookedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
