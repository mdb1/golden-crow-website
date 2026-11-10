export const PARTNERS_API_ROUTE = "/admin/connected-partners";
export const PARTNERS_ROUTE = "/god-mode/partners";
export const PARTNERS_QUERY_KEY = ["connected-partners"] as const;

export type PartnerInput = {
  companyName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  meetingDate: string | null;
  notes: string | null;
};

export type Partner = PartnerInput & { id: string };
export type PartnersPage = { items: Partner[]; nextCursor: string | null };
