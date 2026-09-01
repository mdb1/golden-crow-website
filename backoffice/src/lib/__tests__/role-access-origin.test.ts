import {
  roleForRoleAccessOrigin,
  selectedRoleForRoleAccess,
} from "@/lib/role-access-origin";

describe("role access origin mapping", () => {
  it("maps staff area categories to their role access pill", () => {
    expect(roleForRoleAccessOrigin("transport-dispatchers")).toBe(
      "transport_dispatcher",
    );
    expect(roleForRoleAccessOrigin("administrative-operators")).toBe(
      "institution_operator",
    );
    expect(roleForRoleAccessOrigin("laboratory-staff")).toBe(
      "institution_laboratory_staff",
    );
  });

  it("uses an explicit role query before the originating category", () => {
    expect(
      selectedRoleForRoleAccess({
        currentRole: "full_admin",
        from: "transport-dispatchers",
        role: "institution_admin",
      }),
    ).toBe("institution_admin");
  });

  it("falls back to the current role when the originating category is unknown", () => {
    expect(
      selectedRoleForRoleAccess({
        currentRole: "institution_doctor",
        from: "unknown",
      }),
    ).toBe("institution_doctor");
  });
});
