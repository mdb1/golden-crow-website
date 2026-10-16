// Public static routes (epic #451): the two .well-known association files the
// iOS / Android apps depend on for Universal Links / App Links, and the
// botfarm dashboard. Both association files fail SILENTLY on the device when
// wrong (the link just opens the browser), so their exact shape is pinned.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as aasa from "@/app/.well-known/apple-app-site-association/route";
import * as assetlinks from "@/app/.well-known/assetlinks.json/route";
import * as botfarm from "@/app/botfarm/route";

describe("/.well-known/apple-app-site-association", () => {
  it("serves application/json (Apple drops octet-stream silently)", async () => {
    const res = aasa.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("has the exact applinks shape: modern components + legacy paths, only /f/*", async () => {
    const body = await aasa.GET().json();
    expect(body).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["F2VBZV9LC6.com.goldencrow.fitness"],
            components: [{ "/": "/f/*", comment: "Rutinas y perfiles compartidos" }],
          },
          { appID: "F2VBZV9LC6.com.goldencrow.fitness", paths: ["/f/*"] },
        ],
      },
    });
  });

  it("is force-static", () => {
    expect(aasa.dynamic).toBe("force-static");
  });
});

describe("/.well-known/assetlinks.json", () => {
  it("serves application/json", () => {
    const res = assetlinks.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("delegates handle_all_urls to the Play-signed package", async () => {
    const body = await assetlinks.GET().json();
    expect(body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.goldencrow.fitness",
          sha256_cert_fingerprints: [
            "E8:97:39:77:75:74:FE:8A:63:96:14:3A:27:CF:8A:D9:41:DD:FE:B7:A3:9C:E8:95:22:63:BA:7C:AB:F4:6C:CD",
          ],
        },
      },
    ]);
  });

  it("fingerprints are upper-case colon-separated SHA-256", async () => {
    const [entry] = await assetlinks.GET().json();
    for (const fp of entry.target.sha256_cert_fingerprints as string[]) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });
});

describe("/botfarm", () => {
  it("serves public/botfarm/index.html as utf-8 HTML", async () => {
    const res = await botfarm.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await res.text();
    expect(html).toBe(
      readFileSync(join(process.cwd(), "public", "botfarm", "index.html"), "utf8"),
    );
    // Relative asset URLs only resolve because of this <base>.
    expect(html).toContain('<base href="/botfarm/">');
  });

  it("is a static nodejs route", () => {
    expect(botfarm.runtime).toBe("nodejs");
    expect(botfarm.dynamic).toBe("force-static");
  });
});
