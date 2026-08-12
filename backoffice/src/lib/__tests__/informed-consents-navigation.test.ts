import type { AdminRole } from "@/lib/admin-areas";
import { getProjectNav } from "@/lib/moderation-config";

const BACKOFFICE_ROLES: AdminRole[] = [
  "full_admin",
  "organization_publisher",
  "institution_admin",
  "institution_operator",
  "institution_laboratory_staff",
  "institution_doctor",
];

describe("informed consent navigation", () => {
  it.each(BACKOFFICE_ROLES)(
    "shows Consentimientos to %s",
    (role) => {
      expect(
        getProjectNav("mydnamap", role).some(
          (item) => item.href === "/2pq-dashboard/consents",
        ),
      ).toBe(true);
    },
  );
});
