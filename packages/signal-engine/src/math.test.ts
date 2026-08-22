import { describe, expect, it } from "vitest";
import { aggregate } from "./math";
import type { FactorResult } from "./types";

function factor(code: string, family: FactorResult["family"], score: NonNullable<FactorResult["score"]>): FactorResult {
  return { code, family, score, timing: "CONFIRMING", rawValue: score, description: code, status: "VALID" };
}

describe("factor-family aggregation", () => {
  it("does not give a family extra weight when it contains more factors", () => {
    const liquidity = factor("STABLECOIN", "CRYPTO_NATIVE_LIQUIDITY", -2);
    const btcFlows = factor("BTC_ETF", "INSTITUTIONAL_FLOWS", 2);
    const ethFlows = factor("ETH_ETF", "INSTITUTIONAL_FLOWS", 2);

    expect(aggregate([liquidity, btcFlows], 1).score).toBe(0);
    expect(aggregate([liquidity, btcFlows, ethFlows], 1).score).toBe(0);
  });
});
