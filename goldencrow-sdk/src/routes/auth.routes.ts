import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { adminAuthFor } from "../config/firebase.js";

// Pitfall 16 — Session cookies are minted via the MyDNAMap project (the
// canonical legacy auth surface for the backoffice). Both verifyIdToken
// and createSessionCookie below operate on the mydnamap Auth handle. A
// future non-legacy session-cookie flow would route to a separate handler
// bound to its own named-app accessor.
const adminAuth = adminAuthFor("mydnamap");
import {
  getAdminCapabilities,
  resolveAdminContext,
} from "../repositories/roles.repository.js";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  changeMyAccountEmailForContext,
  getMyAccountForContext,
  updateMyAccountRoleProfileForContext,
} from "../repositories/my-account.repository.js";
import {
  completeProfileSetup,
  completePatientProfileSetup,
  createEligibleEmailAccount,
  getEmailSignupEligibility,
  getProfileSetupState,
  isProfileSetupError,
} from "../repositories/profile-setup.repository.js";

const LoginBodySchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
  surface: z
    .enum(["backoffice", "patient-portal", "pgflex"])
    .default("backoffice"),
});

const EmailSignupEligibilitySchema = z.object({
  email: z.string().email(),
  surface: z
    .enum(["backoffice", "patient-portal", "pgflex"])
    .default("backoffice"),
});

const EmailSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  surface: z
    .enum(["backoffice", "patient-portal", "pgflex"])
    .default("backoffice"),
});

const CompleteProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  iconName: z.string().trim().min(1).max(100),
  iconColorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  ownerProfession: z.string().max(120).optional(),
  ownerCompany: z.string().max(120).optional(),
  ownerContactNumber: z.string().max(30).optional(),
  ownerBio: z.string().max(600).optional(),
  gender: z.string().max(50).optional(),
  condition: z.string().max(120).optional(),
});

const MyAccountRoleProfileSchema = z.object({
  displayName: z.string().trim().max(100).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(600).optional(),
});

const MyAccountEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.post(
    "/auth/email-signup/eligibility",
    {
      schema: {
        body: EmailSignupEligibilitySchema,
      },
    },
    async (request, reply) => {
      const eligibility = await getEmailSignupEligibility(
        request.body.email,
        request.body.surface,
      );
      return reply.send(eligibility);
    },
  );

  f.post(
    "/auth/email-signup",
    {
      schema: {
        body: EmailSignupSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await createEligibleEmailAccount(request.body);
        return reply.status(201).send(result);
      } catch (error) {
        if (isProfileSetupError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.post(
    "/auth/login",
    {
      schema: {
        body: LoginBodySchema,
      },
    },
    async (request, reply) => {
      const { idToken, surface } = request.body;
      // 5 days in milliseconds
      const expiresIn = 1000 * 60 * 60 * 24 * 5;

      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken, true);

        const adminContext = await resolveAdminContext({
          email: decodedToken.email,
          uid: decodedToken.uid,
        });

        const canAccessRequestedSurface =
          surface === "patient-portal"
            ? adminContext?.canAccessPatientPortal
            : surface === "pgflex"
              ? adminContext?.canAccessPGFlex
              : adminContext?.canAccessBackoffice;
        if (!adminContext || !canAccessRequestedSurface) {
          const requiredSurface = adminContext?.canAccessBackoffice
            ? "backoffice"
            : adminContext?.canAccessPatientPortal
              ? "patient-portal"
              : adminContext?.canAccessPGFlex
                ? "pgflex"
                : undefined;
          const requiredLogin =
            requiredSurface === "patient-portal"
              ? "patient portal"
              : requiredSurface === "pgflex"
                ? "PGFlex"
                : "backoffice";
          return reply.status(403).send({
            error: requiredSurface
              ? `This account must sign in through the ${requiredLogin} login.`
              : "Account not authorized",
            code: requiredSurface
              ? "WRONG_AUTH_SURFACE"
              : "ACCOUNT_NOT_AUTHORIZED",
            requiredSurface,
          });
        }

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn,
        });

        reply.setCookie("session", sessionCookie, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn / 1000, // @fastify/cookie uses seconds
          path: "/",
        });

        return { status: "ok" };
      } catch {
        return reply.status(401).send({ error: "Invalid ID token" });
      }
    },
  );

  f.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { status: "ok" };
  });

  f.get("/auth/context", async (request, reply) => {
    if (!request.adminContext) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    return reply.send({
      context: request.adminContext,
      capabilities: getAdminCapabilities(request.adminContext),
    });
  });

  f.get("/auth/my-account", async (request, reply) => {
    if (!request.adminContext || !request.user?.uid) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const account = await getMyAccountForContext(request.adminContext);
      return reply.send({ account });
    } catch (error) {
      if (isAdminRepositoryError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });

  f.put(
    "/auth/my-account/role",
    {
      schema: {
        body: MyAccountRoleProfileSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext || !request.user?.uid) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const account = await updateMyAccountRoleProfileForContext(
          request.adminContext,
          request.body,
        );
        return reply.send({ account });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.put(
    "/auth/my-account/email",
    {
      schema: {
        body: MyAccountEmailSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext || !request.user?.uid) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const result = await changeMyAccountEmailForContext(
          request.adminContext,
          request.body.email,
        );
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get("/auth/profile-setup", async (request, reply) => {
    if (!request.adminContext || !request.user?.uid) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    try {
      const state = await getProfileSetupState(request.user.uid);
      return reply.send({ state });
    } catch (error) {
      if (isProfileSetupError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });

  f.put(
    "/auth/profile-setup",
    {
      schema: {
        body: CompleteProfileSchema,
      },
    },
    async (request, reply) => {
      if (!request.adminContext || !request.user?.uid) {
        return reply
          .status(401)
          .send({ error: "No authenticated admin context" });
      }

      try {
        const state = await completeProfileSetup(
          request.user.uid,
          request.adminContext.role,
          request.body,
        );
        return reply.send({ state });
      } catch (error) {
        if (isProfileSetupError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.put("/auth/profile-setup/patient", async (request, reply) => {
    const context = request.adminContext;
    if (!context || !request.user?.uid) {
      return reply
        .status(401)
        .send({ error: "No authenticated admin context" });
    }

    if (
      context.role !== "patient" ||
      !context.canAccessPatientPortal ||
      context.canAccessBackoffice ||
      !context.patientId
    ) {
      return reply
        .status(403)
        .send({ error: "Patient portal access is required." });
    }

    try {
      const state = await completePatientProfileSetup(
        request.user.uid,
        context.patientId,
      );
      return reply.send({ state });
    } catch (error) {
      if (isProfileSetupError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      throw error;
    }
  });
}
