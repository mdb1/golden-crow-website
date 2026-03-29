"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sdkFetch } from "@/lib/sdk-client";
import { DnaReport } from "@/app/(dashboard)/reports/columns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteReportResult {
  success: boolean;
  storageDeleted: boolean;
}

interface ReportDeleteDialogProps {
  report: DnaReport;
  redirectTo?: string;
}

export function ReportDeleteDialog({
  report,
  redirectTo = "/reports",
}: ReportDeleteDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [storageWarning, setStorageWarning] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      sdkFetch<DeleteReportResult>(`/reports/${report.id}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      if (!result.storageDeleted) {
        // Known gap from Phase 2 SDK — storage path unconfirmed; not an error
        setStorageWarning(true);
      }
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      router.push(redirectTo);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete Report
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete report {report.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the report code and its linked uploaded
            report metadata from Firestore. The associated storage file may not
            be deleted automatically. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {storageWarning && (
          <p className="text-sm text-muted-foreground px-2">
            Report deleted. The associated storage file may still exist and
            must be removed manually from Firebase Storage.
          </p>
        )}
        {mutation.error && (
          <p className="text-sm text-destructive px-2">
            Delete failed. Please try again.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
