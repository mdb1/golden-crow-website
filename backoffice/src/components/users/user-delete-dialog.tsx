"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { sdkFetch } from "@/lib/sdk-client";
import { AdminUser } from "@/app/(dashboard)/users/columns";
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

interface CascadeDeleteResult {
  success: boolean;
  errors: string[];
}

interface UserDeleteDialogProps {
  user: AdminUser;
}

export function UserDeleteDialog({ user }: UserDeleteDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      sdkFetch<CascadeDeleteResult>(`/users/${encodeURIComponent(user.uid)}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        console.warn("Cascade delete partial errors:", result.errors);
      }
      queryClient.invalidateQueries({ queryKey: ["users"] });
      router.push("/users");
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete User
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {user.displayName || user.email}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the user account, Firestore profile,
            community posts, comments, and learning progress. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
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
