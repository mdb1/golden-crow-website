import { redirect } from "next/navigation";
import { PGFLEX_ENTRY_ROUTE } from "@/lib/pgflex-routes";

export default function PGFlexPage() {
  redirect(PGFLEX_ENTRY_ROUTE);
}
