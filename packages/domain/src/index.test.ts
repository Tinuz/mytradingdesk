import { describe, expect, it } from "vitest";
import {
  ASSET_SYMBOLS,
  EVIDENCE_STATUSES,
  INVESTOR_OBJECTIVES,
  INVESTMENT_REGIME_LABELS_NL,
  REGIME_SCORES,
  type CapitalAllocationRecommendation,
} from "./index";

describe("domain vocabulary", () => {
  it("limits normalized scores to five deterministic values", () => {
    expect(REGIME_SCORES).toEqual([-2, -1, 0, 1, 2]);
  });

  it("keeps the MVP asset scope limited to BTC and ETH", () => {
    expect(ASSET_SYMBOLS).toEqual(["BTC", "ETH"]);
  });

  it("provides approved Dutch decision labels", () => {
    expect(INVESTMENT_REGIME_LABELS_NL.DEFENSIVE).toBe("Defensief");
  });

  it("keeps recommendation evidence separate from data confidence", () => {
    expect(EVIDENCE_STATUSES).toEqual([
      "HYPOTHESIS",
      "SHADOW",
      "VALIDATED",
      "RETIRED",
    ]);
    const recommendation = {
      evidenceStatus: "SHADOW",
      targetRangePercent: null,
    } satisfies Pick<
      CapitalAllocationRecommendation,
      "evidenceStatus" | "targetRangePercent"
    >;
    expect(recommendation.targetRangePercent).toBeNull();
  });

  it("uses a closed investor-objective vocabulary", () => {
    expect(INVESTOR_OBJECTIVES).toEqual([
      "CAPITAL_PRESERVATION",
      "BALANCED",
      "GROWTH",
    ]);
  });
});
