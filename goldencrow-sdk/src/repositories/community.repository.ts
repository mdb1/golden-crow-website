import { adminDb } from "../config/firebase.js";
import type { CommunityPost, CommunityComment } from "../types/sdk.types.js";

/**
 * List community posts ordered by createdAt desc with optional filters and cursor pagination.
 * NOTE: Filtering by community + ordering by createdAt requires a composite Firestore index in production.
 */
export async function listPosts(
  filters?: { community?: string },
  limit = 50,
  startAfter?: string
): Promise<CommunityPost[]> {
  let q = adminDb
    .collection("community_posts")
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (filters?.community) {
    q = q.where("community", "==", filters.community) as typeof q;
  }

  if (startAfter) {
    const cursorDoc = await adminDb.collection("community_posts").doc(startAfter).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc) as typeof q;
    }
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityPost);
}

/**
 * Fetch a single post by ID. Returns null if not found.
 */
export async function getPostById(postId: string): Promise<CommunityPost | null> {
  const snap = await adminDb.collection("community_posts").doc(postId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CommunityPost;
}

/**
 * Delete a post and cascade-delete all its comments.
 * NOTE: Only deletes first 500 comments due to Firestore batch limit.
 * If more than 500 comments exist, a warning is logged.
 */
export async function deletePost(
  postId: string
): Promise<{ success: boolean; commentsDeleted: number }> {
  // Step 1: Delete comments for this post
  let commentsDeleted = 0;
  try {
    const commentSnap = await adminDb
      .collection("community_comments")
      .where("postId", "==", postId)
      .get();

    if (commentSnap.docs.length > 500) {
      console.warn(
        `[deletePost] Post ${postId} has ${commentSnap.docs.length} comments; only deleting first 500.`
      );
    }

    if (!commentSnap.empty) {
      const batch = adminDb.batch();
      const docsToDelete = commentSnap.docs.slice(0, 500);
      docsToDelete.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      commentsDeleted = docsToDelete.length;
    }
  } catch (err) {
    console.error(`[deletePost] Failed to delete comments for post ${postId}:`, err);
    throw err;
  }

  // Step 2: Delete the post itself
  try {
    await adminDb.collection("community_posts").doc(postId).delete();
  } catch (err) {
    // Comments were already deleted — log this situation
    console.error(
      `[deletePost] CRITICAL: Comments for post ${postId} were deleted (count: ${commentsDeleted}) but post delete failed:`,
      err
    );
    throw err;
  }

  return { success: true, commentsDeleted };
}

/**
 * List comments for a specific post, ordered by createdAt asc with cursor pagination.
 * NOTE: Filtering by postId + ordering by createdAt requires a composite Firestore index.
 */
export async function listComments(
  postId: string,
  limit = 50,
  startAfter?: string
): Promise<CommunityComment[]> {
  let q = adminDb
    .collection("community_comments")
    .where("postId", "==", postId)
    .orderBy("createdAt", "asc")
    .limit(limit);

  if (startAfter) {
    const cursorDoc = await adminDb.collection("community_comments").doc(startAfter).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc) as typeof q;
    }
  }

  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunityComment);
}

/**
 * Fetch a single comment by ID. Returns null if not found.
 */
export async function getCommentById(commentId: string): Promise<CommunityComment | null> {
  const snap = await adminDb.collection("community_comments").doc(commentId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as CommunityComment;
}

/**
 * Delete a single comment. Caller handles 404 logic if needed.
 */
export async function deleteComment(commentId: string): Promise<void> {
  await adminDb.collection("community_comments").doc(commentId).delete();
}

/**
 * Update a post's title and/or body. Returns null if post not found.
 */
export async function updatePost(
  postId: string,
  data: { title?: string; body?: string }
): Promise<CommunityPost | null> {
  const docRef = adminDb.collection("community_posts").doc(postId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const updateObj: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.title !== undefined) updateObj.title = data.title;
  if (data.body !== undefined) updateObj.body = data.body;

  await docRef.update(updateObj);
  const updated = await docRef.get();
  return { id: updated.id, ...updated.data() } as CommunityPost;
}
