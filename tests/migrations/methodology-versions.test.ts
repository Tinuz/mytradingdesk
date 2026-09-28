import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAPER_NAV_CALCULATION_VERSION,
  RECOMMENDATION_OUTCOME_VERSION,
} from "@cmip/signal-engine";

const dir = resolve("supabase/migrations");
const migrations = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(dir, name), "utf8"))
  .join("\n");

describe("methodology registry", () => {
  it.each([PAPER_NAV_CALCULATION_VERSION, RECOMMENDATION_OUTCOME_VERSION])(
    "registers %s",
    (version) => {
      expect(migrations).toMatch(
        new RegExp(
          `insert into public\\.methodology_versions[\\s\\S]*?'${version}'`,
        ),
      );
    },
  );
});
