import { readFileSync } from "fs";
import { join } from "path";

const SOURCE_FILES = [
  "src/components/ui/input.tsx",
  "src/components/ui/textarea.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/input-group.tsx",
  "src/components/ui/command.tsx",
] as const;

function readSource(file: string) {
  return readFileSync(join(process.cwd(), file), "utf8");
}

describe("CRM dark mode controls", () => {
  it("does not use the bright input token as a dark-mode field background", () => {
    for (const file of SOURCE_FILES) {
      const source = readSource(file);

      expect(source).not.toMatch(/\bdark:bg-input\b/);
    }
  });

  it("pins black CRM control surfaces after Tailwind utilities", () => {
    const css = readSource("src/app/globals.css");

    expect(css).toContain("CRM + Plantillas - unlayered dark control overrides");
    expect(css).toContain('[data-slot="input"]');
    expect(css).toContain('[data-slot="textarea"]');
    expect(css).toContain('[data-slot="select-trigger"]');
    expect(css).toContain('[data-slot="select-content"].crm-control-dropdown');
    expect(css).toContain("background: #000 !important");
    expect(css).toContain("color: #fff !important");
  });
});
