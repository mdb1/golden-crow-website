// coach-activity-grouping.test.ts
// The read-time collapse behind "Mi Actividad" (#927).
//
// What these lock:
//   1. a bulk assign renders as ONE row, not fifteen;
//   2. the collapsed row stops pointing at ONE of the clients it covers — a link that is
//      true for the head and a lie for everyone else;
//   3. a group of ONE is returned untouched, because that is what a per-client filtered
//      feed produces and it must look exactly as it did before #927;
//   4. rows WITHOUT a groupId are never merged with each other, whatever else they share.

import {
  collapseActivityGroups,
  describeGroupedClients,
  type GroupableActivityRow,
} from "../coach-activity-grouping";

function row(
  id: string,
  overrides: Partial<GroupableActivityRow> = {},
): GroupableActivityRow {
  return {
    id,
    title: "Nutrición asignada: Definición",
    detail: "2026-09-01 → sin fecha de fin",
    clientId: id,
    clientName: id,
    groupId: null,
    ...overrides,
  };
}

describe("collapseActivityGroups", () => {
  it("folds every member of a group into one row and counts them", () => {
    const out = collapseActivityGroups([
      row("ana", { groupId: "bulk-1", clientName: "Ana" }),
      row("bruno", { groupId: "bulk-1", clientName: "Bruno" }),
      row("carla", { groupId: "bulk-1", clientName: "Carla" }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]!.groupCount).toBe(3);
    expect(out[0]!.title).toBe("Nutrición asignada: Definición");
  });

  it("keeps the window in the detail and appends who the row covers", () => {
    const out = collapseActivityGroups([
      row("ana", { groupId: "bulk-1", clientName: "Ana" }),
      row("bruno", { groupId: "bulk-1", clientName: "Bruno" }),
    ]);

    expect(out[0]!.detail).toBe("2026-09-01 → sin fecha de fin · Ana y Bruno");
  });

  it("nulls clientId on a collapsed row so it cannot link to one of many", () => {
    const out = collapseActivityGroups([
      row("ana", { groupId: "bulk-1", clientName: "Ana" }),
      row("bruno", { groupId: "bulk-1", clientName: "Bruno" }),
    ]);

    expect(out[0]!.clientId).toBeNull();
    expect(out[0]!.clientName).toBeNull();
  });

  it("leaves a group of one exactly as it was — the filtered-by-client case", () => {
    const single = row("ana", { groupId: "bulk-1", clientName: "Ana" });
    const out = collapseActivityGroups([single]);

    expect(out).toHaveLength(1);
    expect(out[0]!.groupCount).toBe(1);
    expect(out[0]!.clientId).toBe("ana");
    expect(out[0]!.detail).toBe("2026-09-01 → sin fecha de fin");
  });

  it("never merges rows that carry no groupId", () => {
    const out = collapseActivityGroups([
      row("ana"),
      row("bruno"),
      row("carla", { groupId: "" }),
    ]);

    expect(out).toHaveLength(3);
    expect(out.every((r) => r.groupCount === 1)).toBe(true);
  });

  it("keeps two different groups apart and preserves input order", () => {
    const out = collapseActivityGroups([
      row("ana", { groupId: "assign", title: "Nutrición asignada: Definición" }),
      row("bruno", { groupId: "assign", title: "Nutrición asignada: Definición" }),
      row("ana-old", { groupId: "trimmed", title: "Fase de nutrición recortada: Volumen" }),
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]!.title).toBe("Nutrición asignada: Definición");
    expect(out[0]!.groupCount).toBe(2);
    expect(out[1]!.title).toBe("Fase de nutrición recortada: Volumen");
    expect(out[1]!.groupCount).toBe(1);
  });

  it("holds the head's position when a group's members are not adjacent", () => {
    const out = collapseActivityGroups([
      row("ana", { groupId: "bulk-1", clientName: "Ana" }),
      row("otra-cosa"),
      row("bruno", { groupId: "bulk-1", clientName: "Bruno" }),
    ]);

    expect(out.map((r) => r.id)).toEqual(["ana", "otra-cosa"]);
    expect(out[0]!.groupCount).toBe(2);
  });
});

describe("describeGroupedClients", () => {
  it("spells out up to three names", () => {
    expect(describeGroupedClients(["Ana", "Bruno", "Carla"])).toBe("Ana, Bruno y Carla");
  });

  it("names three and counts the rest", () => {
    expect(describeGroupedClients(["Ana", "Bruno", "Carla", "Dani", "Eli"])).toBe(
      "Ana, Bruno, Carla y 2 más",
    );
  });

  it("returns a single name with no conjunction", () => {
    expect(describeGroupedClients(["Ana"])).toBe("Ana");
  });

  it("counts unnamed clients rather than rendering a raw uid", () => {
    expect(describeGroupedClients([null, null])).toBe("2 clientes");
  });

  it("keeps unnamed members in the remainder so the total never shrinks", () => {
    // Four clients, one of whom has no resolvable name: the row must still say four.
    expect(describeGroupedClients(["Ana", "Bruno", "Carla", null])).toBe(
      "Ana, Bruno, Carla y 1 más",
    );
  });

  it("is null when there is nothing to describe", () => {
    expect(describeGroupedClients([])).toBeNull();
  });
});
