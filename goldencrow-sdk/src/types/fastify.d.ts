import { DecodedIdToken } from "firebase-admin/auth";
import type { AdminContext } from "./sdk.types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: DecodedIdToken;
    adminContext?: AdminContext;
  }
}
