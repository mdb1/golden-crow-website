// nav-config.test.ts — #451 regression net.
//
// The Corvo sidebar tree consumed by `getProjectNav("gc-fitness", role)`.
// Structural invariants: every item lives in a declared section, every href is
// a flat /gc-fitness/* route, nothing is duplicated, and visibility is the
// AREA_ROLES set (patients never see the coach portal).

import { GC_FITNESS_NAV, GC_FITNESS_SECTIONS } from "../nav-config";

const TRAINER_ROLES = ["full_admin", "institution_admin", "institution_doctor"];

describe("GC_FITNESS_SECTIONS", () => {
  it("declares the four sections in order with unique keys", () => {
    expect(GC_FITNESS_SECTIONS.map((s) => s.key)).toEqual([
      "gc-fitness-roster",
      "gc-fitness-content",
      "gc-fitness-engagement",
      "gc-fitness-engineering",
    ]);
  });

  it("is visible to the trainer-equivalent roles only", () => {
    for (const section of GC_FITNESS_SECTIONS) {
      expect([...(section.visibleRoles ?? [])].sort()).toEqual([...TRAINER_ROLES].sort());
      expect(section.visibleRoles).not.toContain("patient");
    }
  });
});

describe("GC_FITNESS_NAV", () => {
  const sectionKeys = new Set(GC_FITNESS_SECTIONS.map((s) => s.key));

  it("lists the expected routes", () => {
    expect(GC_FITNESS_NAV.map((item) => item.href)).toEqual([
      "/gc-fitness/clients",
      "/gc-fitness/recent-logs",
      "/gc-fitness/my-activity",
      "/gc-fitness/templates",
      "/gc-fitness/habits",
      "/gc-fitness/exercises",
      "/gc-fitness/chat",
      "/gc-fitness/settings",
      "/gc-fitness/qa-tools",
    ]);
  });

  it("every item points at a declared section, has a label, icon and description", () => {
    for (const item of GC_FITNESS_NAV) {
      expect(sectionKeys.has(item.section)).toBe(true);
      expect(item.label.trim()).not.toBe("");
      expect(item.description?.trim()).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });

  it("every section has at least one item", () => {
    for (const key of sectionKeys) {
      expect(GC_FITNESS_NAV.some((item) => item.section === key)).toBe(true);
    }
  });

  it("hrefs and labels are unique", () => {
    const hrefs = GC_FITNESS_NAV.map((item) => item.href);
    const labels = GC_FITNESS_NAV.map((item) => item.label);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("hrefs are flat, internal /gc-fitness/* paths (no external / protocol-relative links)", () => {
    for (const item of GC_FITNESS_NAV) {
      expect(item.href).toMatch(/^\/gc-fitness\/[a-z-]+$/);
    }
  });

  it("items share the trainer role set and never include patient", () => {
    for (const item of GC_FITNESS_NAV) {
      expect([...(item.visibleRoles ?? [])].sort()).toEqual([...TRAINER_ROLES].sort());
    }
  });

  it("QA Tools is the only engineering item", () => {
    expect(
      GC_FITNESS_NAV.filter((item) => item.section === "gc-fitness-engineering").map((i) => i.href),
    ).toEqual(["/gc-fitness/qa-tools"]);
  });
});
