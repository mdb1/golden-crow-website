import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS,
  DISCOVER_ORGANIZATION_CATEGORY_OPTIONS,
} from "@/lib/discover-publisher-categories";
import { appText } from "@/lib/language";

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return entry === "__tests__" ? [] : sourceFilesIn(filePath);
    }

    return /\.(ts|tsx)$/.test(filePath) ? [filePath] : [];
  });
}

function discoverUiKeys() {
  const roots = [
    path.join(process.cwd(), "src/app/(dashboard)/discover"),
    path.join(process.cwd(), "src/components/discover"),
  ];
  const keys = new Set<string>();
  const expressions = [
    /\bt\(\s*"((?:[^"\\]|\\.)+)"\s*\)/g,
    /appText\(\s*language\s*,\s*"((?:[^"\\]|\\.)+)"\s*\)/g,
    /label:\s*"((?:[^"\\]|\\.)+)"/g,
  ];

  for (const file of roots.flatMap(sourceFilesIn)) {
    const source = readFileSync(file, "utf8");

    for (const expression of expressions) {
      let match: RegExpExecArray | null;
      while ((match = expression.exec(source)) !== null) {
        keys.add(match[1]);
      }
    }
  }

  [
    ...DISCOVER_ORGANIZATION_CATEGORY_OPTIONS.map((option) => option.label),
    ...DISCOVER_INDIVIDUAL_CATEGORY_OPTIONS.map((option) => option.label),
    "Discover feed publishers and mobile feed entries.",
    "feed_organizations publishers",
    "feed_individuals publishers",
    "feed_items mobile Discover entries",
    "Publishers stored in feed_organizations for Discover feed entries.",
    "Publishers stored in feed_individuals for Discover feed entries.",
    "Create a Discover publisher for mobile feed entries.",
    "Discover publisher detail.",
    "Mobile Discover feed entries stored in feed_items.",
    "Create a Discover feed item with a publisher snapshot.",
    "Discover feed item detail with type-specific payload validation.",
    "active",
    "inactive",
    "archived",
    "draft",
    "published",
  ].forEach((key) => keys.add(key));

  return keys;
}

describe("Discover Spanish translations", () => {
  it("covers the Discover route and workbench UI", () => {
    const intentionallyUnchanged = new Set([
      "Discover",
      "Genes",
      "OK",
      "Telegram",
      "WhatsApp",
    ]);
    const untranslated = [...discoverUiKeys()]
      .filter((key) => !intentionallyUnchanged.has(key))
      .filter((key) => appText("es", key) === key)
      .sort((a, b) => a.localeCompare(b));

    expect(untranslated).toEqual([]);
  });

  it("uses editor-facing Spanish copy for individual publishers", () => {
    expect(appText("es", "Individual Publishers")).toBe("Editores");
    expect(appText("es", "Individual publisher")).toBe("Editor");
    expect(appText("es", "New individual publisher")).toBe("Nuevo editor");
    expect(appText("es", "Create individual publisher")).toBe("Crear editor");
    expect(appText("es", "Back to individual publishers")).toBe(
      "Volver a editores",
    );
    expect(appText("es", "Individual publisher name")).toBe(
      "Nombre del editor",
    );
    expect(appText("es", "Individual publisher created.")).toBe(
      "Editor creado.",
    );
    expect(appText("es", "Select individual publisher")).toBe(
      "Seleccionar editor",
    );
  });
});
