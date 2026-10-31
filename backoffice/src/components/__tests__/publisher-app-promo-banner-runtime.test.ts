/** @jest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type LayoutEntry = {
  id?: string;
  parent?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
};

type AtomicRuntimeWindow = Window & {
  ATOMIC_ASSETS?: Record<string, unknown>;
  mountAtomicBanner?: (
    host: HTMLElement,
    config: Record<string, unknown>,
  ) => {
    destroy: () => void;
    getLayout: () => LayoutEntry[];
  };
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("PocketGenes atomic banner material contract", () => {
  const runtimeWindow = window as AtomicRuntimeWindow;

  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;

    const assetSource = readFileSync(
      join(
        process.cwd(),
        "public/open-api/pocketgenes-atomic-banner/asset-library.js",
      ),
      "utf8",
    );
    const bannerSource = readFileSync(
      join(
        process.cwd(),
        "public/open-api/pocketgenes-atomic-banner/banner.js",
      ),
      "utf8",
    );

    window.eval(assetSource);
    window.eval(bannerSource);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the accepted geometry while exposing independent finish layers", () => {
    const host = document.createElement("div");
    host.getBoundingClientRect = () =>
      ({ width: 1024, height: 500 }) as DOMRect;
    document.body.append(host);

    const instance = runtimeWindow.mountAtomicBanner?.(host, {
      companyName: "DNA INSTITUTE",
      accent: "#00E83C",
      accentDeep: "#038726",
      accentLight: "#7AFF9E",
      backgroundDeep: "#046C20",
      backgroundMid: "#06B234",
      materialLight: "#7AFF9E",
      surface: "#F2F7F4",
      surfaceTop: "#F8FCF9",
      surfaceBottom: "#DCF4E2",
      halo: "#66FF8F",
      highlight: "#FFFFFF",
      ink: "#052E10",
      shadow: "#04240D",
    });

    expect(instance).toBeDefined();
    const layout = instance?.getLayout() ?? [];
    const byId = (id: string) => layout.filter((entry) => entry.id === id);

    expect(byId("surface-price-panel")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 169, y: 369, width: 275, height: 85 }),
      ]),
    );
    expect(byId("surface-now-chip")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 188, y: 397, width: 72, height: 29 }),
      ]),
    );
    expect(byId("price-contact-support")).toHaveLength(1);
    expect(byId("panel-local-glow")).toHaveLength(1);
    expect(byId("surface-panel-rim")).toHaveLength(1);

    const action = host.querySelector<HTMLElement>(".atomic-action");
    expect(action?.style.left).toBe("833px");
    expect(action?.style.top).toBe("405px");
    expect(action?.style.width).toBe("162px");
    expect(action?.style.height).toBe("50px");
    expect(byId("cta-directional-support")).toHaveLength(1);
    expect(byId("surface-cta")).toHaveLength(1);
    expect(byId("cta-face-highlight")).toHaveLength(1);
    expect(byId("cta-filled-spark")).toHaveLength(1);

    expect(byId("surface-pill").map(({ width, height }) => [width, height])).toEqual(
      [
        [116, 36],
        [129, 36],
        [141, 36],
      ],
    );

    expect(byId("surface-ui-row")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parent: "front", width: 184, height: 48 }),
      ]),
    );
    expect(byId("shadow-ui-row").length).toBe(byId("surface-ui-row").length);
    expect(byId("device-frame-metal")).toHaveLength(3);
    expect(byId("device-edge-halo")).toHaveLength(3);
    expect(byId("device-screen-reflection")).toHaveLength(3);

    expect(byId("tile-specular")).toHaveLength(2);
    expect(byId("tile-neutral-glyph")).toHaveLength(1);
    expect(byId("floor-contact-core-front")).toHaveLength(1);
    expect(byId("floor-reflection-patch-center")).toHaveLength(1);

    const devices = layout.filter((entry) =>
      ["rear-left", "rear-right", "front"].includes(entry.id ?? ""),
    );
    expect(devices.map(({ id, z }) => [id, z])).toEqual([
      ["rear-left", 20],
      ["rear-right", 21],
      ["front", 30],
    ]);

    instance?.destroy();
  });
});
