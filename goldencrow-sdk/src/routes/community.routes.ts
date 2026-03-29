import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  listPosts,
  getPostById,
  deletePost,
  updatePost,
  listComments,
  getCommentById,
  deleteComment,
} from "../repositories/community.repository.js";

export async function communityRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  // GET /posts — list community posts, optional ?community= and ?startAfter= filters
  f.get(
    "/posts",
    {
      schema: {
        querystring: z.object({
          community: z.string().optional(),
          startAfter: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { community, startAfter } = request.query;
      const filters: { community?: string } = {};
      if (community) filters.community = community;

      const posts = await listPosts(filters, 50, startAfter);
      return reply.send({ posts });
    }
  );

  // GET /posts/:postId — get a single post or 404
  f.get(
    "/posts/:postId",
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const post = await getPostById(request.params.postId);
      if (!post) {
        return reply.status(404).send({ error: "Post not found" });
      }
      return reply.send({ post });
    }
  );

  // PUT /posts/:postId — update a post's title and/or body
  f.put(
    "/posts/:postId",
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
        body: z.object({
          title: z.string().min(1).max(300).optional(),
          body: z.string().min(1).max(10000).optional(),
        }),
      },
    },
    async (request, reply) => {
      const post = await updatePost(request.params.postId, request.body);
      if (!post) {
        return reply.status(404).send({ error: "Post not found" });
      }
      return reply.send({ post });
    }
  );

  // DELETE /posts/:postId — cascade-deletes comments then removes the post
  f.delete(
    "/posts/:postId",
    {
      schema: {
        params: z.object({ postId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const result = await deletePost(request.params.postId);
      return reply.send(result);
    }
  );

  // GET /comments — list comments for a post, requires ?postId= query param
  f.get(
    "/comments",
    {
      schema: {
        querystring: z.object({
          postId: z.string().min(1), // required — no postId means no comment listing
          startAfter: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { postId, startAfter } = request.query;
      const comments = await listComments(postId, 50, startAfter);
      return reply.send({ comments });
    }
  );

  // GET /comments/:commentId — get a single comment or 404
  f.get(
    "/comments/:commentId",
    {
      schema: {
        params: z.object({ commentId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const comment = await getCommentById(request.params.commentId);
      if (!comment) {
        return reply.status(404).send({ error: "Comment not found" });
      }
      return reply.send({ comment });
    }
  );

  // DELETE /comments/:commentId — remove a single comment
  f.delete(
    "/comments/:commentId",
    {
      schema: {
        params: z.object({ commentId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      await deleteComment(request.params.commentId);
      return reply.status(204).send();
    }
  );
}
