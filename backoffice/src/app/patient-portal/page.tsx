import { redirect } from "next/navigation";
import { PATIENT_PORTAL_ENTRY_ROUTE } from "@/lib/patient-portal-routes";

export default function PatientPortalIndexPage() {
  redirect(PATIENT_PORTAL_ENTRY_ROUTE);
}
