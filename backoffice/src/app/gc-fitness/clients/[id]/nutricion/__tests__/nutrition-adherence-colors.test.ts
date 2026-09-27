// The adherence bars read GREEN for high compliance and RED for low — the scale was inverted
// (the "green" token was `chart-2`, which is pink in every theme; green is `chart-3`).
import { barColor } from "../_components/NutritionAdherenceCharts";

describe("nutrition adherence bar colours", () => {
  it("is green from 80%, amber from 50%, red below", () => {
    expect(barColor(100)).toBe("var(--color-chart-3)");
    expect(barColor(80)).toBe("var(--color-chart-3)");
    expect(barColor(79)).toBe("var(--color-chart-4)");
    expect(barColor(50)).toBe("var(--color-chart-4)");
    expect(barColor(49)).toBe("var(--color-destructive)");
    expect(barColor(0)).toBe("var(--color-destructive)");
  });

  it("never uses chart-2 — pink in every theme, it is what made the scale read backwards", () => {
    for (const percent of [0, 25, 50, 75, 80, 100]) {
      expect(barColor(percent)).not.toBe("var(--color-chart-2)");
    }
  });
});
