import { getAssignableRoleOptionsForContext } from "../admin-areas";

function roleValues(
  options: ReturnType<typeof getAssignableRoleOptionsForContext>,
) {
  return options.map((option) => option.value);
}

describe("getAssignableRoleOptionsForContext", () => {
  it("hides organization publisher creation from non-God full admins", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: false,
      }),
    );

    expect(values).toContain("full_admin");
    expect(values).toContain("institution_admin");
    expect(values).not.toContain("organization_publisher");
  });

  it("keeps organization publisher creation available for God Mode users", () => {
    const values = roleValues(
      getAssignableRoleOptionsForContext({
        role: "full_admin",
        isBootstrap: true,
      }),
    );

    expect(values).toContain("organization_publisher");
  });
});
