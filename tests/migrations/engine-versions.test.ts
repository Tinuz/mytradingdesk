import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALERT_ENGINE_VERSION } from "@cmip/notifications";
import { V3_DECISION_CONFIG, V3_REGIME_CONFIG } from "@cmip/signal-engine";

// Snapshots reference engine_versions(version) by foreign key, so every
// version the code writes must be registered by a migration.
const dir = resolve("supabase/migrations");
const migrations = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(dir, name), "utf8"))
  .join("\n");

describe("engine version registry", () => {
  it.each([
    ["regime", V3_REGIME_CONFIG.version],
    ["decision", V3_DECISION_CONFIG.version],
    ["alert", ALERT_ENGINE_VERSION],
  ])("registers the active %s engine version", (_name, version) => {
    expect(migrations).toMatch(
      new RegExp(`insert into public\\.engine_versions[\\s\\S]*?'${version}'`),
    );
  });

  it("moves the alert watermark to the active alert engine", () => {
    expect(migrations).toContain(`engine_version = '${ALERT_ENGINE_VERSION}'`);
  });
});
