import { listRecentLogsForTrainer } from "@/lib/gc-fitness/recent-logs-actions";
import { RecentLogsFeed } from "./_components/RecentLogsFeed";

export const dynamic = "force-dynamic";

export default async function RecentLogsPage() {
  const { logs, clients } = await listRecentLogsForTrainer();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Recent Logs
        </h1>
        <p className="text-sm text-muted-foreground">
          Latest client activity across habits and workouts, sorted newest first.
        </p>
      </div>
      <RecentLogsFeed logs={logs} clients={clients} />
    </div>
  );
}
