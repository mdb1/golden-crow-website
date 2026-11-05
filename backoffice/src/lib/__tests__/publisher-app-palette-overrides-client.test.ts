import { fetchPublisherAppPaletteOverrides } from "@/lib/publisher-app-palette-overrides-client";
import { publisherAppColorsWithCounterpoints } from "@/lib/publisher-app-config";

const colors = publisherAppColorsWithCounterpoints({
  primary: "#FF5500",
  secondary: "#FFB21F",
  tertiary: "#F58220",
});

describe("publisher app palette override client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a valid palette plan", async () => {
    const plan = {
      catalogVersion: 5,
      sourceCount: 620,
      selectedCount: 1,
      colorOverrides: {
        "learn.level.bacteria.accent": {
          light: "#FF5500",
          dark: "#FF5500",
        },
      },
    };
    global.fetch = jest.fn().mockResolvedValue(Response.json(plan));

    await expect(fetchPublisherAppPaletteOverrides(colors)).resolves.toEqual(
      plan,
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/publisher-app/palette-overrides",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("does not leak an HTML JSON parser error when a route is redirected", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response("<!DOCTYPE html><html><body>Portal</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );

    await expect(fetchPublisherAppPaletteOverrides(colors)).rejects.toThrow(
      "La coordinación de colores recibió una respuesta inválida. Intentá nuevamente.",
    );
  });

  it("uses a JSON API error when one is returned", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Authentication required." }, { status: 401 }),
      );

    await expect(fetchPublisherAppPaletteOverrides(colors)).rejects.toThrow(
      "Authentication required.",
    );
  });
});
