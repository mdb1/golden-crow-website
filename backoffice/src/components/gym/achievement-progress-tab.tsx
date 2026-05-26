"use client";

import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface UserAchievementRecord {
  id: string;
  achievementId: string;
  xpEarned: number;
  earnedAt: string;
}

export function AchievementProgressTab({ uid }: { uid: string }) {
  const earned = useQuery({
    queryKey: ["gym-user-achievements", uid],
    queryFn: () =>
      sdkFetch<{ earned: UserAchievementRecord[] }>(
        `/gym/members/${uid}/achievements`
      ),
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {earned.isLoading && <Skeleton className="h-32 w-full" />}
      {earned.error && (
        <p className="text-sm text-destructive">
          Failed to load achievements.
        </p>
      )}
      {earned.data && earned.data.earned.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No athlete achievements earned yet.
        </p>
      )}
      {earned.data && earned.data.earned.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {earned.data.earned.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between">
                <p className="truncate font-mono text-sm font-medium">
                  {a.achievementId}
                </p>
                <Badge variant="default">+{a.xpEarned} XP</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Earned {new Date(a.earnedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
