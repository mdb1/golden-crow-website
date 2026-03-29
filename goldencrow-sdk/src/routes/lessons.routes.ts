import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { canManageLegacyModeration } from "../repositories/roles.repository.js";
import {
  getLessonTree,
  getLessonById,
  updateLesson,
} from "../repositories/lessons.repository.js";

export async function lessonRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook("onRequest", async (request, reply) => {
    if (!request.adminContext || !canManageLegacyModeration(request.adminContext)) {
      return reply.status(403).send({ error: "Full admin access required" });
    }
  });

  // GET /lessons — returns the full lesson tree (subjects → chapters → lessons)
  f.get(
    "/lessons",
    {},
    async (_request, reply) => {
      const tree = await getLessonTree();
      return reply.send({ tree });
    }
  );

  // GET /lessons/:lessonId — returns a single lesson's content with paragraphs
  f.get(
    "/lessons/:lessonId",
    {
      schema: {
        params: z.object({
          lessonId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const lesson = await getLessonById(request.params.lessonId);
      if (!lesson) {
        return reply.status(404).send({ error: "Lesson not found" });
      }
      return reply.send({ lesson });
    }
  );

  // PUT /lessons/:lessonId — persists changes to Firestore and returns the updated lesson
  f.put(
    "/lessons/:lessonId",
    {
      schema: {
        params: z.object({
          lessonId: z.string().min(1),
        }),
        body: z.object({
          lessonTitle: z.string().optional(),
          paragraphs: z
            .array(
              z.object({
                paragraphTitle: z.string(),
                icon: z.string(),
                contentText: z.string(),
              })
            )
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const lesson = await updateLesson(request.params.lessonId, request.body);
      if (!lesson) {
        return reply.status(404).send({ error: "Lesson not found" });
      }
      return reply.send({ lesson });
    }
  );
}
