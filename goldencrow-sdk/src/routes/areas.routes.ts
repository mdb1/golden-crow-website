import {
  FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { isAdminRepositoryError } from "../repositories/admin-errors.js";
import {
  createDoctorForContext,
  createInstitutionForContext,
  createPatientForContext,
  deleteDoctorForContext,
  deleteInstitutionForContext,
  deletePatientForContext,
  getDoctorDetailForContext,
  getInstitutionDetailForContext,
  getPatientDetailForContext,
  getPatientPortalTemporaryPasswordForContext,
  grantPatientPortalAccessForContext,
  listDoctorsForContext,
  listInstitutionsForContext,
  listPatientsForContext,
  updateDoctorForContext,
  updateInstitutionForContext,
  updatePatientForContext,
} from "../repositories/areas.repository.js";
import {
  DOCTOR_DELETION_STEPS,
  deleteDoctorStepForContext,
} from "../repositories/doctor-deletion.repository.js";

const ActiveStatusSchema = z.enum(["active", "inactive"]);

function sendDoctorDeletionStepError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  const baseError =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unexpected error");
  const statusCode = isAdminRepositoryError(error) ? error.statusCode : 500;
  const requestContext = {
    id: request.id,
    method: request.method,
    url: request.url,
    params: request.params,
    query: request.query,
  };

  if (statusCode === 500) {
    request.log.error(
      { err: error, request: requestContext },
      "Doctor cleanup step failed",
    );
  }

  return reply.status(statusCode).send({
    error:
      statusCode === 500 ? "Doctor cleanup step failed." : baseError.message,
    message: baseError.message,
    errorName: baseError.name || "Error",
    statusCode,
    hint:
      statusCode === 500
        ? "Use the doctor cleanup stage log, request id, and server trace to diagnose the failed request."
        : "The doctor cleanup request was rejected by a validation or permission rule.",
    request: requestContext,
    stack: statusCode === 500 ? baseError.stack : undefined,
  });
}

export async function areasRoutes(fastify: FastifyInstance): Promise<void> {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.get("/areas/institutions", async (request, reply) => {
    if (!request.adminContext) {
      return reply.status(401).send({ error: "No authenticated admin context" });
    }

    const institutions = await listInstitutionsForContext(request.adminContext);
    return reply.send({ institutions });
  });

  f.post(
    "/areas/institutions",
    {
      schema: {
        body: z.object({
          code: z.string().optional(),
          name: z.string().min(1),
          legalName: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const institution = await createInstitutionForContext(
          request.adminContext,
          request.body
        );
        return reply.send({ institution });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/areas/institutions/:institutionId",
    {
      schema: {
        params: z.object({
          institutionId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const detail = await getInstitutionDetailForContext(
          request.adminContext,
          request.params.institutionId
        );
        return reply.send(detail);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.put(
    "/areas/institutions/:institutionId",
    {
      schema: {
        params: z.object({
          institutionId: z.string().min(1),
        }),
        body: z.object({
          code: z.string().optional(),
          name: z.string().optional(),
          legalName: z.string().optional(),
          contactEmail: z.string().optional(),
          contactPhone: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const institution = await updateInstitutionForContext(
          request.adminContext,
          request.params.institutionId,
          request.body
        );
        return reply.send({ institution });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.delete(
    "/areas/institutions/:institutionId",
    {
      schema: {
        params: z.object({
          institutionId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteInstitutionForContext(
          request.adminContext,
          request.params.institutionId
        );
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/areas/doctors",
    {
      schema: {
        querystring: z.object({
          institutionId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const doctors = await listDoctorsForContext(request.adminContext, request.query);
      return reply.send({ doctors });
    }
  );

  f.post(
    "/areas/doctors",
    {
      schema: {
        body: z.object({
          institutionId: z.string().min(1),
          authEmail: z.string().min(1),
          authUid: z.string().optional(),
          fullName: z.string().min(1),
          specialty: z.string().optional(),
          licenseNumber: z.string().optional(),
          contactPhone: z.string().optional(),
          status: ActiveStatusSchema.optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const doctor = await createDoctorForContext(request.adminContext, request.body);
        return reply.send({ doctor });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/areas/doctors/:doctorId",
    {
      schema: {
        params: z.object({
          doctorId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const detail = await getDoctorDetailForContext(
          request.adminContext,
          request.params.doctorId
        );
        return reply.send(detail);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.put(
    "/areas/doctors/:doctorId",
    {
      schema: {
        params: z.object({
          doctorId: z.string().min(1),
        }),
        body: z.object({
          authEmail: z.string().optional(),
          authUid: z.string().optional(),
          fullName: z.string().optional(),
          specialty: z.string().optional(),
          licenseNumber: z.string().optional(),
          contactPhone: z.string().optional(),
          status: ActiveStatusSchema.optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const doctor = await updateDoctorForContext(
          request.adminContext,
          request.params.doctorId,
          request.body
        );
        return reply.send({ doctor });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.delete(
    "/areas/doctors/:doctorId/deletion/:step",
    {
      schema: {
        params: z.object({
          doctorId: z.string().min(1),
          step: z.enum(DOCTOR_DELETION_STEPS),
        }),
        querystring: z.object({
          scope: z.enum(["doctor", "full"]),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteDoctorStepForContext(
          request.adminContext,
          request.params.doctorId,
          request.query.scope,
          request.params.step,
        );
        return reply.send(result);
      } catch (error) {
        return sendDoctorDeletionStepError(request, reply, error);
      }
    },
  );

  f.delete(
    "/areas/doctors/:doctorId",
    {
      schema: {
        params: z.object({
          doctorId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deleteDoctorForContext(
          request.adminContext,
          request.params.doctorId
        );
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/areas/patients",
    {
      schema: {
        querystring: z.object({
          institutionId: z.string().optional(),
          doctorId: z.string().optional(),
          query: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      const patients = await listPatientsForContext(request.adminContext, request.query);
      return reply.send({ patients });
    }
  );

  f.post(
    "/areas/patients",
    {
      schema: {
        body: z.object({
          institutionId: z.string().min(1),
          doctorId: z.string().min(1),
          email: z.string().min(1),
          fullName: z.string().min(1),
          medicalRecordNumber: z.string().optional(),
          birthDate: z.string().optional(),
          sex: z.string().optional(),
          status: ActiveStatusSchema.optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const patient = await createPatientForContext(request.adminContext, request.body);
        return reply.send({ patient });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.get(
    "/areas/patients/:patientId",
    {
      schema: {
        params: z.object({
          patientId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const detail = await getPatientDetailForContext(
          request.adminContext,
          request.params.patientId
        );
        return reply.send(detail);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.put(
    "/areas/patients/:patientId",
    {
      schema: {
        params: z.object({
          patientId: z.string().min(1),
        }),
        body: z.object({
          institutionId: z.string().optional(),
          doctorId: z.string().optional(),
          email: z.string().optional(),
          fullName: z.string().optional(),
          medicalRecordNumber: z.string().optional(),
          birthDate: z.string().optional(),
          sex: z.string().optional(),
          status: ActiveStatusSchema.optional(),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const patient = await updatePatientForContext(
          request.adminContext,
          request.params.patientId,
          request.body
        );
        return reply.send({ patient });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );

  f.post(
    "/areas/patients/:patientId/patient-portal-access",
    {
      schema: {
        params: z.object({
          patientId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await grantPatientPortalAccessForContext(
          request.adminContext,
          request.params.patientId,
        );
        return reply
          .header("Cache-Control", "private, no-store")
          .send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.get(
    "/areas/patients/:patientId/patient-portal-access/temporary-password",
    {
      schema: {
        params: z.object({
          patientId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const temporaryPassword =
          await getPatientPortalTemporaryPasswordForContext(
            request.adminContext,
            request.params.patientId,
          );
        return reply
          .header("Cache-Control", "private, no-store")
          .send({ temporaryPassword });
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  f.delete(
    "/areas/patients/:patientId",
    {
      schema: {
        params: z.object({
          patientId: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      if (!request.adminContext) {
        return reply.status(401).send({ error: "No authenticated admin context" });
      }

      try {
        const result = await deletePatientForContext(
          request.adminContext,
          request.params.patientId
        );
        return reply.send(result);
      } catch (error) {
        if (isAdminRepositoryError(error)) {
          return reply.status(error.statusCode).send({ error: error.message });
        }

        throw error;
      }
    }
  );
}
