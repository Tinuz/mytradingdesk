import { describe, expect, it } from "vitest";
import { ASSET_SYMBOLS, INVESTMENT_REGIME_LABELS_NL, REGIME_SCORES } from "./index";

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
});
