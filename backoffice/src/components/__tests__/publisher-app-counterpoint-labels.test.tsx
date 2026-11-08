/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { PublisherAppPaletteComposition } from "@/components/publisher-app-palette-composition";
import { PublisherAppVisualIdentityEditor, type VisualIdentityColorField } from "@/components/publisher-app-visual-identity-editor";
import { publisherAppCounterpointPlan, publisherAppPreviousCounterpointColors, publisherAppSupersededCounterpointColors, type PublisherAppColors } from "@/lib/publisher-app-config";

const mockAutomaticColors = {
  counterpointClockwise: "#112233",
  counterpointAnticlockwise: "#223344",
  counterpointFarClockwise: "#334455",
  counterpointFarAnticlockwise: "#445566",
};
const mockPreviousColors = {
  counterpointClockwise: "#AA3300",
  counterpointAnticlockwise: "#BB4400",
  counterpointFarClockwise: "#CC5500",
  counterpointFarAnticlockwise: "#DD6600",
};
const mockSupersededColors = {
  counterpointClockwise: "#AA8899",
  counterpointAnticlockwise: "#BB99AA",
  counterpointFarClockwise: "#CCAABB",
  counterpointFarAnticlockwise: "#DDBBCC",
};
const mockShiftedColors = {
  counterpointClockwise: "#8899AA",
  counterpointAnticlockwise: "#99AABB",
  counterpointFarClockwise: "#AABBCC",
  counterpointFarAnticlockwise: "#BBCCDD",
};
const mockOffsets = {
  counterpointClockwise: 85,
  counterpointAnticlockwise: -5,
  counterpointFarClockwise: 115,
  counterpointFarAnticlockwise: -35,
};
jest.mock("@/lib/publisher-app-config", () => ({
  ...jest.requireActual("@/lib/publisher-app-config"),
  publisherAppCounterpointPlan: jest.fn(() => ({
    colors: mockAutomaticColors,
    offsets: mockOffsets,
  })),
  publisherAppPreviousCounterpointColors: jest.fn(() => mockPreviousColors),
  publisherAppSupersededCounterpointColors: jest.fn(() => [mockSupersededColors, mockShiftedColors]),
}));

const colors: PublisherAppColors = {
  primary: "#123ABC", secondary: "#ABCDEF", tertiary: "#FEDCBA", ...mockAutomaticColors,
};
const fields: VisualIdentityColorField[] = [
  { key: "primary", label: "Color principal", description: "", editable: true },
  { key: "secondary", label: "Color secundario", description: "", editable: true },
  { key: "tertiary", label: "Color terciario", description: "", editable: true },
  { key: "counterpointClockwise", label: "Color de contrapunto horario", description: "", editable: false },
  { key: "counterpointAnticlockwise", label: "Color de contrapunto antihorario", description: "", editable: false },
  { key: "counterpointFarClockwise", label: "Color de contrapunto lejano horario", description: "", editable: false },
  { key: "counterpointFarAnticlockwise", label: "Color de contrapunto lejano antihorario", description: "", editable: false },
];

function renderEditor(value = colors) {
  const onApply = jest.fn().mockResolvedValue(true);
  render(<PublisherAppVisualIdentityEditor id="identity" colors={value} fields={fields} suggestedPalettes={[]} disabled={false} onApply={onApply} onApplied={jest.fn()} stage={2} onStageChange={jest.fn()} />);
  return { onApply };
}

describe("calculated counterpoint angle labels", () => {
  beforeEach(() => {
    jest.mocked(publisherAppCounterpointPlan).mockImplementation(() => ({ colors: mockAutomaticColors, offsets: mockOffsets }));
    jest.mocked(publisherAppPreviousCounterpointColors).mockImplementation(() => mockPreviousColors);
    jest.mocked(publisherAppSupersededCounterpointColors).mockImplementation(() => [mockSupersededColors, mockShiftedColors]);
  });

  it("shows the actual shifted angles in the main composition without fixed-degree claims", () => {
    render(<PublisherAppPaletteComposition colors={colors} />);
    expect(screen.getByText("+85°")).toBeTruthy();
    expect(screen.getByText("+115°")).toBeTruthy();
    expect(screen.getByText("−5°")).toBeTruthy();
    expect(screen.getByText("−35°")).toBeTruthy();
    expect(screen.queryByText(/[457]5°/)).toBeNull();
  });

  it("does not attach a calculated angle to a custom or historical stored color", () => {
    render(<PublisherAppPaletteComposition colors={{ ...colors, counterpointClockwise: "#FF9900", counterpointFarClockwise: mockPreviousColors.counterpointFarClockwise }} />);
    expect(screen.queryByText("+85°")).toBeNull();
    expect(screen.queryByText("+115°")).toBeNull();
    expect(screen.getByText("#FF9900")).toBeTruthy();
    expect(screen.getByText("−5°")).toBeTruthy();
  });

  it("hides the degree when a calculated cell is customized and restores it with the default", () => {
    const { onApply } = renderEditor();
    expect(screen.getByText("+115°")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar color de contrapunto lejano horario" }));
    const picker = within(screen.getByRole("dialog", { name: "Color de contrapunto lejano horario" }));
    fireEvent.change(picker.getByLabelText("Elegir color de contrapunto lejano horario"), { target: { value: "#ffaa00" } });
    fireEvent.click(picker.getByRole("button", { name: "Usar este color" }));
    expect(screen.queryByText("+115°")).toBeNull();
    expect(screen.getByText("Personalizado")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar automático: color de contrapunto lejano horario" }));
    expect(screen.getByText("+115°")).toBeTruthy();
    expect(screen.queryByText("Personalizado")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("upgrades historical automatic colors in the draft without altering unknown custom choices or applying", () => {
    const { onApply } = renderEditor({ ...colors, ...mockPreviousColors, counterpointAnticlockwise: "#FF9900" });
    expect(screen.getByRole("button", { name: "Editar color de contrapunto horario" })).toHaveTextContent(mockAutomaticColors.counterpointClockwise);
    expect(screen.getByRole("button", { name: "Editar color de contrapunto antihorario" })).toHaveTextContent("#FF9900");
    expect(screen.getByText("Personalizado")).toBeTruthy();
    expect(screen.getByText("+115°")).toBeTruthy();
    expect(screen.queryByText("−5°")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it.each([mockSupersededColors, mockShiftedColors])("restores superseded automatic drafts while retaining an unrelated manual color", (previous) => {
    const { onApply } = renderEditor({ ...colors, ...previous, counterpointAnticlockwise: "#FF9900" });
    expect(screen.getByRole("button", { name: "Editar color de contrapunto horario" })).toHaveTextContent(mockAutomaticColors.counterpointClockwise);
    expect(screen.getByRole("button", { name: "Editar color de contrapunto lejano horario" })).toHaveTextContent(mockAutomaticColors.counterpointFarClockwise);
    expect(screen.getByRole("button", { name: "Editar color de contrapunto antihorario" })).toHaveTextContent("#FF9900");
    expect(screen.getAllByText("Personalizado")).toHaveLength(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("preserves the screenshot's vivid first three colors and saves only the fourth adjustment after Apply", () => {
    const actual = jest.requireActual<typeof import("@/lib/publisher-app-config")>("@/lib/publisher-app-config");
    jest.mocked(publisherAppCounterpointPlan).mockImplementation(actual.publisherAppCounterpointPlan);
    jest.mocked(publisherAppPreviousCounterpointColors).mockImplementation(actual.publisherAppPreviousCounterpointColors);
    jest.mocked(publisherAppSupersededCounterpointColors).mockImplementation(actual.publisherAppSupersededCounterpointColors);
    const original: PublisherAppColors = {
      primary: "#40FF00", secondary: "#2AEF47", tertiary: "#82F820",
      counterpointClockwise: "#00FF7F", counterpointAnticlockwise: "#FFFF00",
      counterpointFarClockwise: "#00FFFF", counterpointFarAnticlockwise: "#FF7F00",
    };
    const { onApply } = renderEditor(original);
    expect(screen.getByRole("button", { name: "Editar color de contrapunto horario" })).toHaveTextContent("#00FF7F");
    expect(screen.getByRole("button", { name: "Editar color de contrapunto antihorario" })).toHaveTextContent("#FFFF00");
    expect(screen.getByRole("button", { name: "Editar color de contrapunto lejano horario" })).toHaveTextContent("#00FFFF");
    expect(screen.queryByText("#FF7F00")).toBeNull();
    expect(screen.getByText("+45°")).toBeTruthy();
    expect(screen.getByText("−45°")).toBeTruthy();
    expect(screen.getByText("+75°")).toBeTruthy();
    expect(screen.getByText("−115°")).toBeTruthy();
    expect(screen.getAllByText("Automático")).toHaveLength(4);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(onApply).not.toHaveBeenCalled();
    expect(original.counterpointFarAnticlockwise).toBe("#FF7F00");
    fireEvent.submit(screen.getByRole("form", { name: "Editor de identidad visual" }));
    expect(onApply).toHaveBeenCalledWith({
      ...original,
      counterpointFarAnticlockwise: actual.publisherAppCounterpointPlan(original.primary).colors.counterpointFarAnticlockwise,
    }, "Paleta personalizada");
  });

  it("shows the real screenshot palette and its single −115° adjustment in the main composition", () => {
    const actual = jest.requireActual<typeof import("@/lib/publisher-app-config")>("@/lib/publisher-app-config");
    const plan = actual.publisherAppCounterpointPlan("#40FF00");
    expect(plan.offsets.counterpointFarAnticlockwise).toBe(-115);
    jest.mocked(publisherAppCounterpointPlan).mockImplementationOnce(actual.publisherAppCounterpointPlan);
    render(<PublisherAppPaletteComposition colors={{ ...colors, primary: "#40FF00", ...plan.colors }} />);
    expect(screen.getByText("#00FF7F")).toBeTruthy();
    expect(screen.getByText("#FFFF00")).toBeTruthy();
    expect(screen.getByText("#00FFFF")).toBeTruthy();
    expect(screen.getByText("−115°")).toBeTruthy();
    expect(screen.getByText(plan.colors.counterpointFarAnticlockwise)).toBeTruthy();
  });
});
