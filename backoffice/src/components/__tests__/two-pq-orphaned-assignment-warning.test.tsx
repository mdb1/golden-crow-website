/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TwoPQOrphanedAssignmentWarning } from "@/components/two-pq-orphaned-assignment-warning";

describe("TwoPQOrphanedAssignmentWarning", () => {
  it.each([
    ["cases", "case"],
    ["sampling", "sampling"],
    ["sequencing", "batch"],
  ] as const)("warns when a %s record references deleted entities", (areaKey, label) => {
    render(
      <TwoPQOrphanedAssignmentWarning
        areaKey={areaKey}
        language="en"
        missingAssignedEntities={[
          { kind: "doctor", id: "DOC-REMOVED" },
          { kind: "patient", id: "PAT-REMOVED" },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      `This ${label} has orphaned assignments`,
    );
    expect(screen.getByText("Doctor: DOC-REMOVED")).toBeInTheDocument();
    expect(screen.getByText("Patient: PAT-REMOVED")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "needs attention and deliberate reassignment",
    );
  });

  it("stays hidden when every assigned entity exists", () => {
    const { container } = render(
      <TwoPQOrphanedAssignmentWarning
        areaKey="cases"
        language="en"
        missingAssignedEntities={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("uses the Spanish disclaimer for the 2PQ detail UI", () => {
    render(
      <TwoPQOrphanedAssignmentWarning
        areaKey="sequencing"
        language="es"
        missingAssignedEntities={[
          { kind: "institution", id: "INST-REMOVED" },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este lote tiene asignaciones huérfanas",
    );
    expect(screen.getByText("Institución: INST-REMOVED")).toBeInTheDocument();
  });
});
