// RoleAccessSpec capability matrix in two-pq-dashboard.ts (epic #451).
// The base specs list a handful of roles; withDerivedRoleAccess() fills in
// 2pq_admin (mirror of full_admin), institution_operator (from
// institution_admin) and institution_laboratory_staff (from the operator).
// These invariants pin that derivation plus the explicit role surfaces.

import {
  ADMIN_SURFACE_SPECS,
  CRUD_CAPABILITIES,
  TWO_PQ_WORKFLOW_AREAS,
  canAccessTwoPQRoute,
  getSurfaceSpec,
  getWorkflowArea,
  type RoleAccessSpec,
} from "@/lib/two-pq-dashboard";

const ALL: Array<[string, RoleAccessSpec[]]> = [
  ...TWO_PQ_WORKFLOW_AREAS.map(
    (a) => [`area:${a.key}`, a.roleAccess] as [string, RoleAccessSpec[]],
  ),
  ...ADMIN_SURFACE_SPECS.map(
    (s) => [`surface:${s.key}`, s.roleAccess] as [string, RoleAccessSpec[]],
  ),
];

function entry(list: RoleAccessSpec[], role: string) {
  return list.find((e) => e.role === role);
}

describe.each(ALL)("%s", (_name, roleAccess) => {
  it("lists each role at most once", () => {
    const roles = roleAccess.map((e) => e.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("only uses CRUD capabilities, without duplicates", () => {
    for (const e of roleAccess) {
      expect(new Set(e.capabilities).size).toBe(e.capabilities.length);
      for (const c of e.capabilities) expect(CRUD_CAPABILITIES).toContain(c);
    }
  });

  it("no_access ⇔ no capabilities; read_only ⇒ exactly [read]", () => {
    for (const e of roleAccess) {
      expect(e.scope === "no_access").toBe(e.capabilities.length === 0);
      if (e.scope === "read_only") expect(e.capabilities).toEqual(["read"]);
    }
  });

  it("any write capability implies read", () => {
    for (const e of roleAccess) {
      if (e.capabilities.length) expect(e.capabilities).toContain("read");
    }
  });

  it("2pq_admin mirrors full_admin exactly", () => {
    const full = entry(roleAccess, "full_admin");
    const twoPq = entry(roleAccess, "2pq_admin");
    expect(full).toBeDefined();
    expect(twoPq).toEqual({ ...full, role: "2pq_admin" });
    // Derived copies must not alias the source array.
    expect(twoPq!.capabilities).not.toBe(full!.capabilities);
  });

  it("full_admin is global", () => {
    expect(entry(roleAccess, "full_admin")!.scope).toBe("global");
  });

  it("covers the institution operator + laboratory staff", () => {
    expect(entry(roleAccess, "institution_operator")).toBeDefined();
    expect(entry(roleAccess, "institution_laboratory_staff")).toBeDefined();
  });

  it("derived notes are rewritten for the derived role", () => {
    const op = entry(roleAccess, "institution_operator")!;
    expect(op.note).not.toMatch(/^Institution admin/);
    const lab = entry(roleAccess, "institution_laboratory_staff")!;
    expect(lab.note).not.toMatch(/^Institution (admin|operator)/);
  });

  it("patients never get capabilities on a backoffice surface", () => {
    expect(entry(roleAccess, "patient")).toMatchObject({
      scope: "no_access",
      capabilities: [],
    });
  });

  it("no institution-scoped role exceeds full_admin", () => {
    const full = entry(roleAccess, "full_admin")!.capabilities;
    for (const e of roleAccess) {
      for (const c of e.capabilities) expect(full).toContain(c);
    }
  });
});

describe("explicit surface pins", () => {
  it("roles: nobody can delete role records from this matrix", () => {
    for (const e of getSurfaceSpec("roles")!.roleAccess) {
      expect(e.capabilities).not.toContain("delete");
    }
  });

  it("roles: operators update but cannot create; lab staff and dispatchers have no access", () => {
    const roles = getSurfaceSpec("roles")!.roleAccess;
    expect(entry(roles, "institution_operator")!.capabilities).toEqual(["read", "update"]);
    expect(entry(roles, "institution_laboratory_staff")!.scope).toBe("no_access");
    expect(entry(roles, "transport_dispatcher")!.scope).toBe("no_access");
  });

  it.each(["doctors", "patients"] as const)(
    "%s: laboratory staff are read-only while operators inherit institution_admin CRUD",
    (key) => {
      const ra = getSurfaceSpec(key)!.roleAccess;
      expect(entry(ra, "institution_laboratory_staff")).toMatchObject({
        scope: "read_only",
        capabilities: ["read"],
      });
      expect(entry(ra, "institution_operator")!.capabilities).toEqual(
        entry(ra, "institution_admin")!.capabilities,
      );
    },
  );

  it("institutions: institution admins cannot create or delete institutions", () => {
    const ra = getSurfaceSpec("institutions")!.roleAccess;
    expect(entry(ra, "institution_admin")!.capabilities).toEqual(["read", "update"]);
  });

  it("lookup helpers find every key and return undefined otherwise", () => {
    for (const a of TWO_PQ_WORKFLOW_AREAS) expect(getWorkflowArea(a.key)).toBe(a);
    for (const s of ADMIN_SURFACE_SPECS) expect(getSurfaceSpec(s.key)).toBe(s);
    expect(getWorkflowArea("nope" as never)).toBeUndefined();
  });
});

describe("canAccessTwoPQRoute", () => {
  it("no visibleRoles → everyone", () => {
    expect(canAccessTwoPQRoute("patient")).toBe(true);
  });

  it("listed role → allowed, unlisted → denied", () => {
    expect(canAccessTwoPQRoute("institution_doctor", ["institution_doctor"])).toBe(true);
    expect(canAccessTwoPQRoute("patient", ["institution_doctor"])).toBe(false);
    expect(canAccessTwoPQRoute("patient", [])).toBe(false);
  });

  it("2pq_admin rides on full_admin, but not the reverse", () => {
    expect(canAccessTwoPQRoute("2pq_admin", ["full_admin"])).toBe(true);
    expect(canAccessTwoPQRoute("2pq_admin", ["institution_admin"])).toBe(false);
    expect(canAccessTwoPQRoute("full_admin", ["2pq_admin"])).toBe(false);
  });

  it("no quick link is visible to patients or dispatchers", () => {
    for (const area of TWO_PQ_WORKFLOW_AREAS) {
      for (const link of area.quickLinks) {
        expect(canAccessTwoPQRoute("patient", link.visibleRoles)).toBe(false);
        expect(canAccessTwoPQRoute("transport_dispatcher", link.visibleRoles)).toBe(false);
      }
    }
  });
});
