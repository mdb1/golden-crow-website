import { notFound } from "next/navigation";
import { CommunityPostWorkbench } from "@/components/community/community-post-workbench";
import { PostComments } from "@/components/community/post-comments";
import { PostDeleteDialog } from "@/components/community/post-delete-dialog";
import { HelperBanner } from "@/components/helper-banner";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { sdkFetchServer } from "@/lib/sdk-server";
import type { ModerationDocumentRecord } from "@/lib/moderation-types";
import { parseCommunityPostRecord } from "@/lib/community-admin";
import Link from "next/link";

async function getCommunityPost(postId: string) {
  try {
    const result = await sdkFetchServer<{ document: ModerationDocumentRecord }>(
      `/moderation/community_posts/${postId}`
    );
    return result.document;
  } catch {
    return null;
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const document = await getCommunityPost(postId);

  if (!document) {
    notFound();
  }

  const post = parseCommunityPostRecord(document);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHero
        eyebrow="Community"
        title={post.title || post.id}
        description="Typed moderation screen for the full community post record, with comments still visible below."
      />

      <HelperBanner title="Edit the full post without dropping into raw JSON." tone="rose">
        Use this screen for title, body, tags, author metadata, and counters.
        Raw JSON remains available only as a developer fallback.
      </HelperBanner>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/community">Back to community</Link>
        </Button>
        {post.authorId ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/users/${post.authorId}`}>Open author account</Link>
          </Button>
        ) : null}
        <PostDeleteDialog
          post={{
            id: post.id,
            title: post.title,
            body: post.body,
            community: post.community,
            tags: post.tags,
            authorId: post.authorId,
            authorEmail: post.authorEmail,
            authorIconName: post.authorIconName || undefined,
            authorIconColorHex: post.authorIconColorHex || undefined,
            createdAt: post.createdAt ?? "",
            updatedAt: post.updatedAt,
            commentCount: post.commentCount,
            upvotes: post.upvotes,
            downvotes: post.downvotes,
            score: post.score,
          }}
        />
      </div>

      <CommunityPostWorkbench document={document} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Comments ({post.commentCount})
          </h2>
          <p className="text-sm text-muted-foreground">
            Comments stay visible here so moderators do not have to open the raw
            document screen just to review the current thread.
          </p>
        </div>
        <PostComments postId={postId} />
      </section>
    </div>
  );
}
