import { z } from "zod";

export const CONNECTED_PARTNERS_COLLECTION = "connected-partners";

export const PartnerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

// Meeting dates are civil dates, so they never shift with the viewer's timezone.
export const PartnerInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(180),
    firstName: z.string().trim().min(1).max(140),
    lastName: z.string().trim().min(1).max(140),
    phoneNumber: z.string().trim().min(1).max(50),
    email: z.string().trim().toLowerCase().email().max(254),
    meetingDate: z.iso.date().nullable().default(null),
    notes: z
      .string()
      .trim()
      .max(10000)
      .nullable()
      .default(null)
      .transform((value) => value || null),
  })
  .strict();

export type PartnerInput = z.infer<typeof PartnerInputSchema>;
export type Partner = PartnerInput & { id: string };
export type PartnersPage = { items: Partner[]; nextCursor: string | null };
