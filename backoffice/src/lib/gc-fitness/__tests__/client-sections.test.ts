// #502 — every chart has exactly one home section on the client profile.
import { CLIENT_CHART_IDS } from "../client-chart-preferences";
import { CLIENT_SECTION_CHARTS, CLIENT_SECTION_IDS } from "../client-sections";

describe("client profile sections", () => {
  it("lists the seven sections in nav order", () => {
    expect(CLIENT_SECTION_IDS).toEqual([
      "resumen", "entrenamiento", "habitos", "nutricion", "pagos", "progreso", "chat",
    ]);
  });

  it("places every chart in exactly one section", () => {
    const placed = Object.values(CLIENT_SECTION_CHARTS).flat() as string[];
    expect([...placed].sort()).toEqual([...CLIENT_CHART_IDS].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });
});
