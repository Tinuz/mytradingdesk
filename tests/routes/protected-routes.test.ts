import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every authenticated page lives under a top-level segment of apps/web/app.
// A segment missing from the proxy matcher renders without a session check.
const appDir = join(import.meta.dirname, "../../apps/web/app");
const PUBLIC_SEGMENTS = new Set(["login", "auth", "api", "ui"]);

describe("auth proxy", () => {
  it("protects every top-level page segment", () => {
    const proxy = readFileSync(
      join(import.meta.dirname, "../../apps/web/proxy.ts"),
      "utf8",
    );
    const matched = new Set(
      [...proxy.matchAll(/"\/([a-z-]+)\/:path\*"/g)].map((m) => m[1]),
    );
    const segments = readdirSync(appDir).filter(
      (name) =>
        statSync(join(appDir, name)).isDirectory() &&
        !PUBLIC_SEGMENTS.has(name),
    );
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.filter((name) => !matched.has(name))).toEqual([]);
  });
});
