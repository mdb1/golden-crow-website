// exercise-search.test.ts
//
// Covers the shared exercise discovery haystack used by the library view and
// the picker/multi-add flows. The synonym mapping is the core of issue #180:
// a trainer should find "Military Standing Press" by typing "shoulder press".

import { exerciseSearchHaystack } from "../exercise-search";

describe("exerciseSearchHaystack", () => {
  it("includes keywords and variations for synonym search", () => {
    const haystack = exerciseSearchHaystack({
      name: { en: "Military Standing Press", es: "Press militar de pie" },
      description: { en: "Overhead press.", es: "Press por encima." },
      muscleGroups: ["shoulders", "triceps"],
      equipment: ["barbell", "smith"],
      keywords: ["shoulder press", "overhead press"],
      tags: ["standard-library"],
      variations: ["Seated Shoulder Press"],
    });

    expect(haystack.toLowerCase()).toContain("shoulder press");
    expect(haystack.toLowerCase()).toContain("seated shoulder press");
    expect(haystack.toLowerCase()).toContain("standard-library");
  });
});
