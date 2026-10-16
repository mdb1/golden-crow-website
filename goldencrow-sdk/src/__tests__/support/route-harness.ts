// Shared harness for route-level (inject) tests: a bare Fastify instance with
// the zod compilers, one route plugin, and an onRequest hook that plays the
// part of the auth middleware by attaching whatever AdminContext the test
// chose (or none). Lives outside `*.test.ts` so Jest does not run it as a suite.
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AdminContext } from "../../types/sdk.types.js";

export function makeAdminContext(
  overrides: Partial<AdminContext> = {},
): AdminContext {
  return {
    email: "admin@example.com",
    uid: "admin-uid",
    role: "full_admin",
    isBootstrap: false,
    canAccessBackoffice: true,
    canAccessPatientPortal: false,
    canAccessPGFlex: false,
    canAccessPublisherPortal: false,
    projectAccess: ["mydnamap"],
    ...overrides,
  };
}

export async function buildRouteServer(
  plugin: FastifyPluginAsync,
  getContext: () => AdminContext | undefined,
  options: { prefix?: string } = {},
): Promise<FastifyInstance> {
  const fastify = Fastify();
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.addHook("onRequest", async (request) => {
    const context = getContext();
    if (context) {
      request.adminContext = context;
    }
  });
  await fastify.register(plugin, options.prefix ? { prefix: options.prefix } : {});
  await fastify.ready();
  return fastify;
}
