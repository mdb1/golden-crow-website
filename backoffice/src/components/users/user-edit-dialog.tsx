"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { AdminUser } from "@/app/(dashboard)/users/columns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ColorPaletteField,
  OptionSelectField,
} from "@/components/constrained-fields";
import {
  COMMUNITY_COLOR_OPTIONS,
  COMMUNITY_ICON_OPTIONS,
} from "@/lib/admin-option-catalog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const editSchema = z.object({
  displayName: z.string().min(1, "Name is required").max(100).optional(),
  iconName: z.string().optional(),
  iconColorHex: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface UserEditDialogProps {
  user: AdminUser;
}

export function UserEditDialog({ user }: UserEditDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      displayName: user.displayName,
      iconName: user.iconName,
      iconColorHex: user.iconColorHex,
    },
  });

  const mutation = useMutation({
    mutationFn: (body: EditFormValues) =>
      sdkFetch(`/users/${encodeURIComponent(user.uid)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", user.uid] });
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <OptionSelectField
                      options={COMMUNITY_ICON_OPTIONS}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Select icon"
                      emptyLabel="No icon"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="iconName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="iconColorHex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon Color (hex)</FormLabel>
                  <FormControl>
                    <ColorPaletteField
                      colors={COMMUNITY_COLOR_OPTIONS}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {mutation.error && (
              <p className="text-sm text-destructive">
                Failed to save changes. Please try again.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
