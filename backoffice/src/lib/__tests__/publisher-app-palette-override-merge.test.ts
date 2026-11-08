import { getManualPublisherAppPaletteOverrideLocks, mergePublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-override-merge";

describe("publisher app manual palette preservation", () => {
  const old = { "role.gradient": { light: "#112233", dark: "#223344" } };
  const generated = {
    "role.gradient": { light: "#334455", dark: "#445566" },
    "role.new": { light: "#556677" },
  };

  it("updates automatic appearances while keeping a manual value exactly, including alpha", () => {
    const current = { "role.gradient": { light: "#ABCD127F", dark: "#223344" } };
    expect(mergePublisherAppPaletteOverrides({ generated, current, savedBaseline: old })).toEqual({
      ...generated, "role.gradient": { light: "#ABCD127F", dark: "#445566" },
    });
    expect(current["role.gradient"].dark).toBe("#223344");
    expect(generated["role.gradient"].light).toBe("#334455");
  });

  it("retains an explicit return to native for one appearance or an entire role", () => {
    expect(mergePublisherAppPaletteOverrides({
      generated, current: { "role.gradient": { light: "#112233" } }, savedBaseline: old,
    })).toEqual({ ...generated, "role.gradient": { light: "#334455" } });
    expect(mergePublisherAppPaletteOverrides({ generated, current: {}, savedBaseline: old })).toEqual({
      "role.new": { light: "#556677" },
    });
  });

  it("recognizes older automatic values without treating absent legacy values as manual removals", () => {
    expect(mergePublisherAppPaletteOverrides({
      generated,
      current: { "role.gradient": { dark: "#223344" }, "role.manual": { light: "#ABCDEF" } },
      inferredBaselines: [old],
    })).toEqual({ ...generated, "role.manual": { light: "#ABCDEF" } });
  });

  it("accepts either historical generation baseline, but never overrides an unknown manual color", () => {
    expect(mergePublisherAppPaletteOverrides({
      generated,
      current: { "role.gradient": { light: "#010203", dark: "#08090A" } },
      inferredBaselines: [old, { "role.gradient": { light: "#010203" } }],
    })).toEqual({ ...generated, "role.gradient": { light: "#334455", dark: "#08090A" } });
  });

  it("uses saved provenance exclusively after a manual value happens to equal another generator's value", () => {
    expect(mergePublisherAppPaletteOverrides({
      generated,
      current: { "role.gradient": { light: "#010203", dark: "#223344" } },
      savedBaseline: old,
      inferredBaselines: [{ "role.gradient": { light: "#010203" } }],
    })["role.gradient"]).toEqual({ light: "#010203", dark: "#445566" });
  });

  it("locks manual colors and deliberate native choices without locking generated modes", () => {
    expect(getManualPublisherAppPaletteOverrideLocks({
      current: { "role.gradient": { light: "#AABBCC80" }, "role.manual": { dark: "#998877" } },
      savedBaseline: old,
    })).toEqual({ "role.gradient": { light: true, dark: true }, "role.manual": { dark: true } });
    expect(getManualPublisherAppPaletteOverrideLocks({ current: old, inferredBaselines: [old] })).toEqual({});
  });
});
