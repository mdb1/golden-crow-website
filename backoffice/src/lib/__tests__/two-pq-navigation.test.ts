import { ADMIN_NAV } from "../moderation-config";
import { TWO_PQ_AREA_CONFIGS } from "../two-pq-areas";
import { TWO_PQ_WORKFLOW_AREAS } from "../two-pq-dashboard";

describe("2PQ navigation", () => {
  it("does not expose the retired 2PQ shipments unit", () => {
    expect(TWO_PQ_AREA_CONFIGS.map((area) => area.key)).not.toContain(
      "shipments",
    );
    expect(TWO_PQ_AREA_CONFIGS.map((area) => area.route)).not.toContain(
      "/2pq-dashboard/shipments",
    );
    expect(TWO_PQ_WORKFLOW_AREAS.map((area) => area.key)).not.toContain(
      "shipments",
    );
    expect(ADMIN_NAV.map((item) => item.href)).not.toContain(
      "/2pq-dashboard/shipments",
    );
    expect(ADMIN_NAV.map((item) => item.label)).not.toContain(
      "2PQ Shipments",
    );
  });
});
