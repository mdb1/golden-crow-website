import { TriangleAlert } from "lucide-react";

export function ReportOwnerWarning({
  ownerId,
  ownerExists,
}: {
  ownerId: string;
  ownerExists?: boolean;
}) {
  if (!ownerId || ownerExists !== false) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">Orphaned report owner</p>
        <p className="mt-1 text-sm leading-6">
          This report still references <code>report_owners/{ownerId}</code>, but
          that owner document no longer exists. The report and its code remain
          available and must be reassigned deliberately.
        </p>
      </div>
    </div>
  );
}
