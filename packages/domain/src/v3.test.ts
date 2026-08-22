import { describe, expect, it } from "vitest";
import { CLASSIFICATION_STATUSES, FACTOR_CLASSIFICATIONS, FACTOR_FAMILIES, LIQUIDITY_REGIMES, MARKET_STRUCTURE_REGIMES } from "./index";

describe("v3 closed vocabulary", () => {
  it("uses the five liquidity states required by the v3 model", () => {
    expect(LIQUIDITY_REGIMES).toEqual(["STRONGLY_CONTRACTING", "CONTRACTING", "NEUTRAL", "EXPANDING", "STRONGLY_EXPANDING"]);
  });

  it("keeps opportunity, risk and context classifications explicit", () => {
    expect(FACTOR_CLASSIFICATIONS).toEqual(["LEADING", "CONFIRMING", "RISK", "CONTEXT"]);
    expect(CLASSIFICATION_STATUSES).toEqual(["HYPOTHESIS", "VALIDATED"]);
  });

  it("defines market structure and independent factor families", () => {
    expect(MARKET_STRUCTURE_REGIMES).toHaveLength(5);
    expect(FACTOR_FAMILIES).toContain("DERIVATIVES_LEVERAGE");
    expect(FACTOR_FAMILIES).toContain("ONCHAIN_CREDIT");
  });
});
