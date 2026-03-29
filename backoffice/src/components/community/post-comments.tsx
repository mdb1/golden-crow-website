"use client";
import { useQuery } from "@tanstack/react-query";
import { sdkFetch } from "@/lib/sdk-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import {
  parseCommunityCommentRecord,
  type CommunityCommentRecord,
} from "@/lib/community-admin";
import { CommentDeleteDialog } from "./comment-delete-dialog";
import { CommentEditDialog } from "./comment-edit-dialog";

interface PostCommentsProps {
  postId: string;
}

export function PostComments({ postId }: PostCommentsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["community-comments", postId],
    queryFn: () =>
      sdkFetch<{ documents: ModerationDocumentRecord[] }>(
        `/moderation/community_posts/${postId}/comments`
      ),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load comments. Make sure the SDK is running.
      </p>
    );
  }

  const comments = [...(data?.documents ?? [])]
    .map((document) => parseCommunityCommentRecord(document))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftTime - rightTime;
    });

  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No comments yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.map((comment: CommunityCommentRecord) => (
        <Card key={comment.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>{comment.authorEmail}</span>
                  <span>
                    {comment.createdAt
                      ? new Date(comment.createdAt).toLocaleDateString()
                      : "—"}
                  </span>
                  <span>
                    Score: {comment.upvotes}/{comment.downvotes} (
                    {comment.score > 0 ? `+${comment.score}` : comment.score})
                  </span>
                  {comment.associatedReference ? (
                    <span className="font-mono">
                      Reply to {comment.associatedReference}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <CommentEditDialog postId={postId} comment={comment} />
                <CommentDeleteDialog
                  commentId={comment.id}
                  postId={postId}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
