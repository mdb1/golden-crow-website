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
    "shows Consentimientos 2PQ in Mission to %s",
    (role) => {
      const item = getProjectNav("mydnamap", role).find(
        (candidate) => candidate.href === "/2pq-dashboard/consents",
      );

      expect(item).toMatchObject({
        label: "Consentimientos 2PQ",
        section: "mission",
      });
    },
  );

  it.each(BACKOFFICE_ROLES)(
    "places Consentimientos 2PQ directly after Prestadores 2PQ for %s",
    (role) => {
      const navigation = getProjectNav("mydnamap", role);
      const consentIndex = navigation.findIndex(
        (item) => item.href === "/2pq-dashboard/consents",
      );
      const providersIndex = navigation.findIndex(
        (item) => item.href === "/2pq-dashboard/clients",
      );

      if (providersIndex === -1) {
        expect(consentIndex).toBeGreaterThanOrEqual(0);
        return;
      }

      expect(consentIndex).toBe(providersIndex + 1);
    },
  );
});
