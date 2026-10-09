"use client";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  redirectTo?: string | null;
  trigger?: ReactNode;
}

export function ReportDeleteDialog({
  report,
  redirectTo = "/reports",
  trigger,
}: ReportDeleteDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      sdkFetch<DeleteReportResult>(`/reports/${report.id}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      if (!result.storageDeleted) {
        toast.warning(
          "Report deleted. Its associated storage file may still need manual cleanup."
        );
      } else {
        toast.success(`Report ${report.code} deleted.`);
      }
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report-codes-browser"] });
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
    },
    onError: () => {
      toast.error("The report could not be deleted. Please try again.");
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && mutation.isPending) {
          return;
        }
        if (nextOpen) {
          mutation.reset();
        }
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="destructive" size="sm">
            Delete Report
          </Button>
        )}
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
        {mutation.error && (
          <p className="text-sm text-destructive px-2">
            Delete failed. Please try again.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
