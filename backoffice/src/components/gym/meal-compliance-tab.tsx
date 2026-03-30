"use client";

import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type MealComplianceStatus = "eaten" | "skipped" | "modified";

interface MealComplianceRecord {
  id: string;
  planId: string;
  date: string;
  mealId: string;
  status: MealComplianceStatus;
  loggedAt: string;
}

const statusVariant: Record<
  MealComplianceStatus,
  "default" | "secondary" | "outline"
> = {
  eaten: "default",
  skipped: "secondary",
  modified: "outline",
};

export function MealComplianceTab({ uid }: { uid: string }) {
  const entries = useQuery({
    queryKey: ["gym-meal-compliance", uid],
    queryFn: () =>
      sdkFetch<{ entries: MealComplianceRecord[] }>(
        `/gym/members/${uid}/meal-compliance`
      ),
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {entries.isLoading && <Skeleton className="h-32 w-full" />}
      {entries.error && (
        <p className="text-sm text-destructive">
          Failed to load meal compliance.
        </p>
      )}
      {entries.data && entries.data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No meal compliance entries recorded yet.
        </p>
      )}
      {entries.data && entries.data.entries.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Meal</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.data.entries.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {new Date(e.date).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                  {e.mealId}
                </td>
                <td className="py-2">
                  <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
