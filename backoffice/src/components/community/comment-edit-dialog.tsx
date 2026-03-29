"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sdkFetch } from "@/lib/sdk-client";
import type { CommunityCommentRecord } from "@/lib/community-admin";

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function CommentEditDialog({
  postId,
  comment,
}: {
  postId: string;
  comment: CommunityCommentRecord;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [associatedReference, setAssociatedReference] = useState(
    comment.associatedReference
  );
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: () =>
      sdkFetch(`/moderation/community_posts/${postId}/comments/${comment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...comment.sourceData,
            body: body.trim(),
            associatedReference: toNullableString(associatedReference),
          },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-comments", postId] });
      setOpen(false);
      router.refresh();
    },
  });

  const isInvalid = !body.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setBody(comment.body);
          setAssociatedReference(comment.associatedReference);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit comment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor={`comment-body-${comment.id}`}>Body</Label>
            <Textarea
              id={`comment-body-${comment.id}`}
              value={body}
              rows={6}
              aria-invalid={isInvalid}
              onChange={(event) => setBody(event.target.value)}
            />
            {isInvalid ? (
              <p className="text-xs text-destructive">Comment body is required.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`comment-reference-${comment.id}`}>
              Associated reference
            </Label>
            <Input
              id={`comment-reference-${comment.id}`}
              value={associatedReference}
              placeholder="Reply target comment id"
              onChange={(event) => setAssociatedReference(event.target.value)}
            />
          </div>
          {mutation.error ? (
            <p className="text-sm text-destructive">
              Failed to save the comment. Please try again.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || isInvalid}
            >
              {mutation.isPending ? "Saving..." : "Save comment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
